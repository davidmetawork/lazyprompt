import "server-only";
import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { getBaseUrl } from "@/lib/base-url";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
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
  "Access-Control-Allow-Headers": "*",
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

/**
 * Bounds bearer-token verification attempts per IP BEFORE any token is verified. A forged JWT with an unknown `kid` makes
 * the verifier refetch the JWKS, so unauthenticated junk tokens must not be able to drive that work without a cap.
 */
async function preAuthAllowed(req: Request, ip: string | null): Promise<boolean> {
  const [type, token] = req.headers.get("authorization")?.split(" ") ?? [];
  if (type?.toLowerCase() !== "bearer" || !token || !ip) return true;
  return (await checkRateLimit(`mcp:auth:${hashIp(ip)}`, PRE_AUTH_LIMIT, 60)).ok;
}

/** Verified-token subject for rate limiting, else the client-provided openai/subject. Used for limiting only, never authz. */
async function rateLimitSubject(req: Request, peek: PeekedRequest): Promise<string | undefined> {
  const header = req.headers.get("authorization");
  const [type, token] = header?.split(" ") ?? [];
  if (type?.toLowerCase() === "bearer" && token) {
    const info = await verifyToken(req, token);
    const userId = info?.extra?.userId;
    if (typeof userId === "string") return `u:${userId}`;
  }
  return peek.subject ? `o:${peek.subject}` : undefined;
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

  // 2. Rate limit per subject plus a per-IP ceiling (token verification attempts are capped per IP first).
  const ip = clientIp(req.headers);
  try {
    if (!(await preAuthAllowed(req, ip))) {
      return jsonRpcError(429, -32029, "Too many requests. Try again in 60s.", peek.id, { "retry-after": "60" });
    }
    await enforceRateLimit("mcp", { userId: await rateLimitSubject(req, peek), ip: ip ?? undefined });
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") {
      return jsonRpcError(429, -32029, e.message, peek.id, { "retry-after": retryAfter(e.message) });
    }
    console.error("[mcp] rate limit check failed:", e instanceof Error ? e.name : "unknown error");
    return jsonRpcError(503, -32603, "Service temporarily unavailable", peek.id);
  }

  // 3. Challenge mode for protected tools (only when OAuth is enabled).
  const wrapped = authed();
  if (env.MCP_OAUTH_ENABLED && peek.protectedCall && selectChallengeMode(env.MCP_AUTH_CHALLENGE, req.headers.get("user-agent")) === "http401") {
    const gate = createMcpProtectedRequestHandler(await protectedHandlerOptions(), (request) => wrapped(request));
    return withCors(await gate(req));
  }
  // 4. withMcpAuth with an optional token: initialize, tools/list, resources/* and read tools stay anonymous.
  return withCors(await wrapped(req));
}

export async function handleMcpOther(req: Request): Promise<Response> {
  return withCors(await authed()(req));
}

export function handleMcpOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
