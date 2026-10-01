// NO "server-only": loaded by tsx, drizzle-kit and `npx auth@latest generate`.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { admin, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { ensureProfile } from "../db/profiles";
import { adminEmails, authSecret } from "../lib/env";
import { getBaseUrl } from "../lib/base-url";
import { sendMagicLink } from "./email";
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

async function promoteIfAdmin(userId: string, email: string): Promise<void> {
  if (!adminEmails().has(email.toLowerCase())) return;
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, userId));
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
  session: { cookieCache: { enabled: true, maxAge: 60 } },   // short, so bans and role changes apply within a minute
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: "database",
    customRules: { "/sign-in/magic-link": { window: 60, max: 3 } },
  },
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] } },
  databaseHooks: {
    user: {
      create: {
        after: async (u) => {
          await ensureProfile({ id: u.id, name: u.name, email: u.email });
          await promoteIfAdmin(u.id, u.email);
        },
      },
    },
    session: {
      create: {
        after: async (s) => {
          if (adminEmails().size === 0) return;
          const [row] = await db.select({ email: schema.user.email, role: schema.user.role })
            .from(schema.user).where(eq(schema.user.id, s.userId)).limit(1);
          if (row && row.role !== "admin") await promoteIfAdmin(s.userId, row.email);
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
