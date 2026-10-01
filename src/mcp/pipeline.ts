import "server-only";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getBaseUrl } from "@/lib/base-url";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { checkRateLimit, clientIp, enforceRateLimit, hashIp } from "@/server/rate-limit";
import { protectedHandlerOptions, verifyToken } from "./auth";
import { MAX_BODY_BYTES, peekBody, selectChallengeMode, type PeekedRequest } from "./config";
import { SERVER_INSTRUCTIONS, registerLazyPromptTools } from "./server";

// Stateless handler (a fresh McpServer per request, the 2025 Streamable HTTP fallback is kept by mcp-handler).
// `registerLazyPromptTools` runs per request, so env (MCP_OAUTH_ENABLED) and base URL are read at request time.
const mcpHandler = createMcpHandler(
  (server) => registerLazyPromptTools(server, { oauthEnabled: env.MCP_OAUTH_ENABLED, baseUrl: getBaseUrl() }),
  { serverInfo: { name: "lazyprompt", version: "1.0.0" }, instructions: SERVER_INSTRUCTIONS },
);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) if (!headers.has(k)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export function jsonRpcError(status: number, code: number, message: string, id: unknown = null, extraHeaders: Record<string, string> = {}): Response {
  return withCors(new Response(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  }));
}

/** Reads at most `limit` bytes of a request body. Returns null when the body is larger. */
async function readLimited(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      // A tee()d branch only settles its cancel() once the sibling is cancelled too: never await it.
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const PRE_AUTH_LIMIT = 600;
const PRE_AUTH_WINDOW_SECONDS = 60;

/**
 * Bounds FAILED bearer-token verifications per IP. A forged JWT with an unknown `kid` makes the verifier refetch the JWKS, so
 * junk tokens must not drive that work without a cap. Only failures count: legitimate clients that share an egress IP
 * (ChatGPT, Claude) never use up this budget with valid tokens.
 *
 * `preAuthBudgetUsed` reads the counter WITHOUT incrementing it, so an IP that already used its budget is refused before
 * any verification (and therefore before any JWKS refetch); the counter is incremented only after a failed verification.
 */
async function preAuthBudgetUsed(ip: string): Promise<boolean> {
  const res = await db.execute<{ count: number }>(sql`
    SELECT count FROM app_rate_limits
    WHERE key = ${`mcp:auth:${hashIp(ip)}`} AND window_start >= now() - make_interval(secs => ${PRE_AUTH_WINDOW_SECONDS}::double precision)
  `);
  return Number(res.rows[0]?.count ?? 0) >= PRE_AUTH_LIMIT;
}

/**
 * Verifies the bearer token (if any) under the pre-auth cap. Returns `blocked: true` when this IP has used up its failed
 * verification budget; otherwise `userId` is the verified user (undefined for anonymous or invalid tokens).
 */
async function verifyBearerUnderCap(req: Request, ip: string | null): Promise<{ blocked: boolean; userId?: string }> {
  const [type, token] = req.headers.get("authorization")?.split(" ") ?? [];
  if (type?.toLowerCase() !== "bearer" || !token) return { blocked: false };
  if (ip && (await preAuthBudgetUsed(ip))) return { blocked: true };
  const info = await verifyToken(req, token);
  const userId = info?.extra?.userId;
  if (typeof userId === "string") return { blocked: false, userId };
  if (ip && !(await checkRateLimit(`mcp:auth:${hashIp(ip)}`, PRE_AUTH_LIMIT, PRE_AUTH_WINDOW_SECONDS)).ok) return { blocked: true };
  return { blocked: false };
}

function retryAfter(message: string): string {
  const m = /(\d+)s/.exec(message);
  return m?.[1] ?? "60";
}

/** withMcpAuth with an optional token: initialize, tools/list, resources/* and the read tools always stay anonymous. */
function authed(): (req: Request) => Promise<Response> {
  return withMcpAuth(mcpHandler, verifyToken, {
    required: false,
    resourceUrl: getBaseUrl(),
    resourceMetadataPath: "/.well-known/oauth-protected-resource",
  });
}

export async function handleMcpPost(req: Request): Promise<Response> {
  // 1. Body size cap, then peek-parse a clone (a malformed body falls through to the JSON-RPC parse error).
  const text = await readLimited(req.clone(), MAX_BODY_BYTES);
  if (text === null) return jsonRpcError(413, -32600, "Request body too large (limit 64 KB)");
  let peek: PeekedRequest = { protectedCall: false };
  try {
    peek = peekBody(JSON.parse(text));
  } catch {
    /* malformed JSON: the handler reports the parse error */
  }

  // 2. Rate limit per subject plus a per-IP ceiling (failed token verifications are capped per IP first).
  const ip = clientIp(req.headers);
  const limited = await gate(req, ip, peek);
  if (limited) return limited;

  // 3. Challenge mode for protected tools (only when OAuth is enabled).
  const wrapped = authed();
  if (env.MCP_OAUTH_ENABLED && peek.protectedCall && selectChallengeMode(env.MCP_AUTH_CHALLENGE, req.headers.get("user-agent")) === "http401") {
    const gate = createMcpProtectedRequestHandler(await protectedHandlerOptions(), (request) => wrapped(request));
    return withCors(await gate(req));
  }
  // 4. withMcpAuth with an optional token: initialize, tools/list, resources/* and read tools stay anonymous.
  return withCors(await wrapped(req));
}

/**
 * Rate limiting shared by every method: the pre-auth cap, then the per-subject and per-IP limits.
 * Returns the response to send when the request is over a limit or the limiter is down, otherwise null.
 */
async function gate(req: Request, ip: string | null, peek: PeekedRequest): Promise<Response | null> {
  try {
    const bearer = await verifyBearerUnderCap(req, ip);
    if (bearer.blocked) {
      return jsonRpcError(429, -32029, "Too many requests. Try again in 60s.", peek.id, { "retry-after": "60" });
    }
    const subject = bearer.userId ? `u:${bearer.userId}` : peek.subject ? `o:${peek.subject}` : undefined;
    await enforceRateLimit("mcp", { userId: subject, ip: ip ?? undefined });
    return null;
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") {
      return jsonRpcError(429, -32029, e.message, peek.id, { "retry-after": retryAfter(e.message) });
    }
    console.error("[mcp] rate limit check failed:", e instanceof Error ? e.name : "unknown error");
    return jsonRpcError(503, -32603, "Service temporarily unavailable", peek.id);
  }
}

/** GET and DELETE (stateless server: no SSE stream, no sessions) go through the same gate as POST. */
export async function handleMcpOther(req: Request): Promise<Response> {
  const limited = await gate(req, clientIp(req.headers), { protectedCall: false });
  if (limited) return limited;
  return withCors(await authed()(req));
}

export function handleMcpOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
