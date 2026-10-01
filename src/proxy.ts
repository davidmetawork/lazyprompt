import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic redirect only (cookie existence, NOT verification). Every page and action re-checks with
// requireViewer / requireAdmin / requireViewerForAction / requireAdminForAction.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const url = new URL("/sign-in", request.url);
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/submit",
    "/submit/:path*",
    "/me/:path*",
    "/settings",
    "/p/:slug/edit",
    "/admin",
    "/admin/:path*",
    "/oauth/consent",
  ],
};
