import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This middleware protects routes that require authentication
export default withAuth(
  function middleware(req: NextRequest) {
    // Returns NextResponse from the callback, if not, NextAuth.js will handle the response
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

// Routes that require authentication
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/create/:path*',
    '/api/prompts/:path*',
    '/api/purchases/:path*',
  ],
}; 