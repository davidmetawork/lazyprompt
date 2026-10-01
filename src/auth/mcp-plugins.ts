// CLI safe (import-graph rule). OAuth 2.1 provider plugins for the MCP connector (ARCHITECTURE.md section 12).
// Owned by the MCP package after the foundation lands.
import type { BetterAuthPlugin } from "better-auth";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { getBaseUrl } from "../lib/base-url";

export function mcpAuthPlugins(): BetterAuthPlugin[] {
  const base = getBaseUrl();
  return [
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      resource: `${base}/mcp`,
      scopes: ["openid", "profile", "email", "offline_access", "prompts:read", "prompts:write"],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
    }),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ] as unknown as BetterAuthPlugin[];
}
