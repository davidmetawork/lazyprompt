// Scopes the MCP authorization server offers. Pure (no server-only), shared by the well-known route and the consent page.
export const MCP_SCOPES = ["openid", "profile", "email", "offline_access", "prompts:read", "prompts:write"] as const;

/** Plain-language descriptions of OAuth scopes for the consent screen. */
export const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Know who you are on LazyPrompt",
  profile: "See your LazyPrompt name and username",
  email: "See your email address",
  offline_access: "Stay connected without asking you to sign in again",
  "prompts:read": "Search and read prompts on your behalf",
  "prompts:write": "Rate prompts and save them to your list on your behalf",
};

export function describeScope(scope: string): string {
  return SCOPE_DESCRIPTIONS[scope] ?? scope;
}
