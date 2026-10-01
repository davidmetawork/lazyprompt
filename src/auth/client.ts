"use client";
import { createAuthClient } from "better-auth/react";
import { magicLinkClient, adminClient } from "better-auth/client/plugins";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";

export const authClient = createAuthClient({
  // oauthProviderClient() is inert unless the page URL carries a signed OAuth query (`sig`): it forwards the
  // continuation (`oauth_query`) with sign-in requests so MCP OAuth clients resume after login (section 12).
  plugins: [magicLinkClient(), adminClient(), oauthProviderClient()],
});
