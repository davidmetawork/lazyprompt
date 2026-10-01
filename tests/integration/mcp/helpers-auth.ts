// Mints access tokens the same way Better Auth's jwt() plugin does, so the MCP route verifies them against the real JWKS.
import { auth } from "@/auth/server";
import { base } from "./helpers";

export async function mintToken(opts: {
  sub: string; scope?: string; aud?: string; iss?: string; expiresInSeconds?: number; clientId?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // The plugin list is typed loosely (src/auth/mcp-plugins.ts), so signJWT is not in auth.api's inferred type.
  const api = auth.api as unknown as { signJWT(a: { body: { payload: Record<string, unknown> } }): Promise<{ token: string }> };
  const res = await api.signJWT({
    body: {
      payload: {
        sub: opts.sub,
        aud: opts.aud ?? `${base()}/mcp`,
        iss: opts.iss ?? `${base()}/api/auth`,
        scope: opts.scope ?? "openid prompts:read prompts:write",
        azp: opts.clientId ?? "test-client",
        iat: now,
        exp: now + (opts.expiresInSeconds ?? 600),
      },
    },
  });
  return res.token;
}

/**
 * The token verifier fetches the JWKS over HTTP from <base>/api/auth/jwks. There is no server in integration tests, so
 * requests for that URL are answered in-process by Better Auth (exactly what the real endpoint would return).
 */
export function stubJwksFetch(): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input instanceof Request ? input : String(input), init);
    if (req.url === `${base()}/api/auth/jwks`) return auth.handler(req);
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}
