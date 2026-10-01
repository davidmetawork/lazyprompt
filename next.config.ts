import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://lh3.googleusercontent.com https://avatars.githubusercontent.com",
  "connect-src 'self' https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://github.com",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  agentRules: false, // do not auto-generate AGENTS.md / CLAUDE.md in the repo
  // cacheComponents stays OFF: every page is dynamic SSR (ARCHITECTURE.md section 9).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  async rewrites() {
    return [{ source: "/.well-known/:path*", destination: "/api/well-known/:path*" }];
  },
  async headers() {
    return [
      // CSP everywhere except the MCP endpoint and well-known metadata (no frame rules there).
      {
        source: "/((?!mcp|api/well-known|.well-known).*)",
        headers: [{ key: "Content-Security-Policy", value: csp }, ...securityHeaders],
      },
      { source: "/mcp", headers: securityHeaders },
      {
        source: "/api/well-known/:path*",
        headers: [
          ...securityHeaders,
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
      {
        source: "/.well-known/:path*",
        headers: [
          ...securityHeaders,
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

export default nextConfig;
