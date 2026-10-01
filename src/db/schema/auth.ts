// Better Auth core + admin + jwt + rateLimit tables. Must match `npx auth@latest generate`;
// after generating, diff and let the CLI win on names/types (see `pnpm auth:generate`).
import { pgTable, text, timestamp, boolean, integer, bigint, index } from "drizzle-orm/pg-core";

const ts = (n: string) => timestamp(n, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  role: text("role").default("user"),               // admin plugin ("user" | "admin")
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
}, (t) => [index("session_user_id_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"), refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"), password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().$onUpdate(() => new Date()),
}, (t) => [index("account_user_id_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const rateLimit = pgTable("rate_limit", {      // Better Auth rateLimit.storage = "database"
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const jwks = pgTable("jwks", {                 // jwt() plugin
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at"),
  alg: text("alg"),
  crv: text("crv"),
});
