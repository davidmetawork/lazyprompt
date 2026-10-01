// CLI safe (import-graph rule): no server-only and nothing from src/server. Loaded by tsx, drizzle-kit and
// `npx auth@latest generate`. OAuth 2.1 provider plugins for the MCP connector (ARCHITECTURE.md section 12).
//
// The plugins are ALWAYS installed (their tables must exist and /.well-known metadata must answer); the
// MCP_OAUTH_ENABLED flag only controls write-tool registration and the HTTP gate in src/mcp/pipeline.ts.
//
// - jwt(): signs the access tokens (JWKS at <base>/api/auth/jwks).
// - mcp(): OAuth provider bound to the MCP resource <base>/mcp. Dynamic client registration (DCR) is what ChatGPT uses;
//   registration is rate-limited by Better Auth's rateLimit rules.
// - cimd(): Client ID Metadata Documents (MCP 2026-07-28 profile) for clients such as Claude.
// Sign-in continuation: loginPage is the stock /sign-in page. oauthProviderClient() (src/auth/client.ts) forwards the signed
// OAuth query (`sig`, ...) with each sign-in call, so the authorize request resumes after login without a wrapper page.
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { getBaseUrl } from "../lib/base-url";
import { MCP_SCOPES } from "../mcp/oauth-metadata";

export function mcpAuthPlugins(): BetterAuthPlugin[] {
  const base = getBaseUrl();
  return [
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      resource: `${base}/mcp`,
      scopes: [...MCP_SCOPES],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ] as unknown as BetterAuthPlugin[];
}
