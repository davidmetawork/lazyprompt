import "server-only";
import { createMcpProtectedRequestHandler, type McpProtectedRequestHandlerOptions } from "@better-auth/mcp";
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { JWTPayload } from "jose";
import { auth } from "@/auth/server";
import { getBaseUrl } from "@/lib/base-url";
import { claimsToAuthInfo } from "./claims";
import { WRITE_SCOPE } from "./config";

export interface McpVerifyConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export function mcpAudience(): string {
  return `${getBaseUrl()}/mcp`;
}

let discovered: { key: string; config: McpVerifyConfig } | undefined;

/**
 * issuer / audience / JWKS for token verification. Defaults to `<base>/api/auth` and `<base>/api/auth/jwks`; if Better Auth's
 * own authorization-server metadata advertises a different issuer or jwks_uri, that value wins (never hard-code a different one).
 * The default is used, uncached, when the metadata cannot be read.
 */
export async function getMcpVerifyConfig(): Promise<McpVerifyConfig> {
  const base = getBaseUrl();
  if (discovered?.key === base) return discovered.config;
  const fallback: McpVerifyConfig = { issuer: `${base}/api/auth`, audience: `${base}/mcp`, jwksUrl: `${base}/api/auth/jwks` };
  try {
    // Synthetic request: no cookies or headers from the incoming MCP request are involved.
    const res = await auth.handler(new Request(`${base}/api/auth/.well-known/oauth-authorization-server`));
    if (!res.ok) return fallback;
    const meta = (await res.json()) as { issuer?: unknown; jwks_uri?: unknown };
    const issuer = typeof meta.issuer === "string" && meta.issuer ? meta.issuer.replace(/\/+$/, "") : fallback.issuer;
    const jwksUrl = typeof meta.jwks_uri === "string" && meta.jwks_uri ? meta.jwks_uri : `${issuer}/jwks`;
    const config = { issuer, audience: fallback.audience, jwksUrl };
    discovered = { key: base, config };
    return config;
  } catch {
    return fallback;
  }
}

/** Options for the HTTP gate that guards rate_prompt / save_prompt (RFC 9728 challenge). */
export async function protectedHandlerOptions(): Promise<McpProtectedRequestHandlerOptions> {
  const cfg = await getMcpVerifyConfig();
  return {
    issuer: cfg.issuer,
    audience: cfg.audience,
    jwksUrl: cfg.jwksUrl,
    requiredScopes: [WRITE_SCOPE],
    challengeScopes: [WRITE_SCOPE],
  };
}

/**
 * `withMcpAuth` token verifier. It shares its verification with the HTTP gate: the request runs through
 * createMcpProtectedRequestHandler with the same issuer, audience and JWKS, and the verified claims are captured.
 * No scope is required here (read tools stay anonymous); write tools check `prompts:write` themselves.
 * An absent or invalid token yields undefined (anonymous). The token is never logged or returned.
 */
export function verifyToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return Promise.resolve(undefined);
  // The pipeline verifies once for rate limiting and withMcpAuth again: share the work per request.
  let pending = verified.get(req);
  if (!pending) {
    pending = verifyBearer(req, bearer);
    verified.set(req, pending);
  }
  return pending;
}

const verified = new WeakMap<Request, Promise<AuthInfo | undefined>>();

async function verifyBearer(req: Request, bearer: string): Promise<AuthInfo | undefined> {
  const cfg = await getMcpVerifyConfig();
  let claims: JWTPayload | undefined;
  const gate = createMcpProtectedRequestHandler(
    { issuer: cfg.issuer, audience: cfg.audience, jwksUrl: cfg.jwksUrl },
    (_request, verified) => {
      claims = verified;
      return new Response(null, { status: 204 });
    },
  );
  try {
    const res = await gate(req);
    if (res.status !== 204 || !claims) return undefined;
    return claimsToAuthInfo(bearer, claims);
  } catch {
    return undefined;
  }
}
