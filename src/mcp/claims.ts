// Pure mapping from verified JWT claims to the MCP SDK's AuthInfo (no server-only imports).
import type { AuthInfo } from "@modelcontextprotocol/server";
import type { JWTPayload } from "jose";

export function scopesOf(claims: JWTPayload): string[] {
  const raw = (claims as { scope?: unknown; scp?: unknown }).scope ?? (claims as { scp?: unknown }).scp;
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string");
  return typeof raw === "string" ? raw.split(/\s+/).filter(Boolean) : [];
}

export function claimsToAuthInfo(token: string, claims: JWTPayload): AuthInfo | undefined {
  if (typeof claims.sub !== "string" || claims.sub === "") return undefined;
  const clientId = (claims as { azp?: unknown; client_id?: unknown }).azp ?? (claims as { client_id?: unknown }).client_id;
  return {
    token,
    clientId: typeof clientId === "string" ? clientId : "unknown",
    scopes: scopesOf(claims),
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { userId: claims.sub },
  };
}
