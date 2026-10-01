// Pure helpers for the OAuth sign-in/consent pages (no server-only imports).

/** Query parameters Better Auth adds when it signs the authorize query for the login/consent redirect. */
const SIGNATURE_PARAMS = new Set(["sig", "exp", "ba_pl", "ba_iat"]);

export type SearchParams = Record<string, string | string[] | undefined>;

export function toUrlSearchParams(sp: SearchParams): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out.append(k, v);
    else if (Array.isArray(v)) for (const item of v) out.append(k, item);
  }
  return out;
}

/**
 * Rebuilds the authorize request from the login-redirect query: the signature params are dropped and `prompt=login`
 * is removed (it has been satisfied by signing in). Returns null when the query is not an authorize request.
 */
export function authorizePathFromQuery(sp: SearchParams): string | null {
  const q = toUrlSearchParams(sp);
  if (!q.get("client_id") || !q.get("response_type")) return null;
  const out = new URLSearchParams();
  for (const [k, v] of q) {
    if (SIGNATURE_PARAMS.has(k) || k.startsWith("ba_")) continue;
    if (k === "prompt") {
      const rest = v.split(/\s+/).filter((p) => p && p !== "login");
      if (rest.length) out.append(k, rest.join(" "));
      continue;
    }
    out.append(k, v);
  }
  return `/api/auth/oauth2/authorize?${out.toString()}`;
}

export function splitScopes(scope: string | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

/** Host of a redirect URI for display, or null when it is not a valid absolute URL. */
export function redirectHost(redirectUri: string | undefined): string | null {
  if (!redirectUri) return null;
  try {
    return new URL(redirectUri).host;
  } catch {
    return null;
  }
}
