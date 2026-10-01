// CLI safe (import-graph rule): loaded by tsx, drizzle-kit and `npx auth@latest generate`.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { ensureProfile } from "../db/profiles";
import { adminEmails, authSecret, rateLimitsRelaxedForE2e } from "../lib/env";
import { getBaseUrl } from "../lib/base-url";
import { sendMagicLink } from "./email";
import { promoteIfAdmin } from "./promote";
import { mcpAuthPlugins } from "./mcp-plugins";

function origins(): string[] {
  const out = new Set<string>([getBaseUrl()]);
  for (const h of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (h) out.add(`https://${h.replace(/^https?:\/\//, "")}`);
  }
  // Local dev/test only: let parallel worktrees run on any localhost port.
  if (process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production") {
    out.add("http://localhost:*");
    out.add("http://127.0.0.1:*");
  }
  return [...out];
}

const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const githubConfigured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

export const auth = betterAuth({
  baseURL: getBaseUrl(),
  secret: authSecret(),
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: origins(),
  socialProviders: {
    ...(googleConfigured ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } } : {}),
    ...(githubConfigured ? { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } } : {}),
  },
  emailAndPassword: { enabled: false },
  // The settings UI never edits name/image through Better Auth (profiles go through our screened server action), so
  // the unscreened update-user endpoint is closed rather than hardened.
  disabledPaths: ["/update-user"],
  session: { cookieCache: { enabled: true, maxAge: 60 } },   // short, so bans and role changes apply within a minute
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" && !rateLimitsRelaxedForE2e(),
    storage: "database",
    customRules: {
      "/sign-in/magic-link": { window: 60, max: 3 },
      // Dynamic client registration is unauthenticated (ChatGPT needs it); cap how many clients one IP can mint.
      "/oauth2/register": { window: 3600, max: 10 },
    },
  },
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] } },
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await ensureProfile({ id: u.id, name: u.name, email: u.email });
          await promoteIfAdmin(u.id, u.email, u.emailVerified === true);
        },
      },
    },
    session: {
      create: {
        after: async (s) => {
          if (adminEmails().size === 0) return;
          const [row] = await db.select({ email: schema.user.email, role: schema.user.role, emailVerified: schema.user.emailVerified })
            .from(schema.user).where(eq(schema.user.id, s.userId)).limit(1);
          if (row && row.role !== "admin") await promoteIfAdmin(s.userId, row.email, row.emailVerified === true);
        },
      },
    },
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    magicLink({ expiresIn: 600, sendMagicLink }),
    ...mcpAuthPlugins(),
    nextCookies(),                                           // must be last
  ],
});

export type Session = typeof auth.$Infer.Session;
