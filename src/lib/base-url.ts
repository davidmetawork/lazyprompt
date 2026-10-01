// Resolution order (ARCHITECTURE.md section 17); the final localhost fallback honors PORT (default 3000)
// so parallel worktrees on other ports resolve their own origin. Reads process.env directly (never throws).
function strip(u: string): string {
  return u.replace(/\/+$/, "");
}
function withHttps(host: string): string {
  return /^https?:\/\//.test(host) ? strip(host) : `https://${strip(host)}`;
}

export function getBaseUrl(): string {
  const e = process.env;
  if (e.BETTER_AUTH_URL) return strip(e.BETTER_AUTH_URL);
  if (e.VERCEL_ENV === "production") {
    if (e.NEXT_PUBLIC_SITE_URL) return strip(e.NEXT_PUBLIC_SITE_URL);
    if (e.VERCEL_PROJECT_PRODUCTION_URL) return withHttps(e.VERCEL_PROJECT_PRODUCTION_URL);
  }
  if (e.VERCEL_ENV === "preview" && e.VERCEL_BRANCH_URL) return withHttps(e.VERCEL_BRANCH_URL);
  if (e.VERCEL_URL) return withHttps(e.VERCEL_URL);
  return `http://localhost:${e.PORT ?? "3000"}`;
}

export function absoluteUrl(path: string): string {
  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
