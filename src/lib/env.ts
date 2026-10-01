import { z } from "zod";

// LAZY environment access. `env` is a Proxy that parses process.env on first property access and memoizes the
// result. It never throws at import time, so tsx scripts, drizzle-kit and the Better Auth CLI can import modules
// that reference it. Must stay CLI safe (import-graph rule in the README).

const DEV_AUTH_SECRET = "dev-insecure-better-auth-secret-0123456789abcdef";
const DEV_IP_SALT = "dev-insecure-ip-hash-salt";

const optionalString = z.string().optional().transform((v) => (v === undefined || v === "" ? undefined : v));
const optionalBool = z.string().optional().transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_URL_UNPOOLED: optionalString,
  BETTER_AUTH_SECRET: optionalString,
  BETTER_AUTH_URL: optionalString,
  NEXT_PUBLIC_SITE_URL: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GITHUB_CLIENT_ID: optionalString,
  GITHUB_CLIENT_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  MAGIC_LINK_DEV_SINK: optionalString,
  ADMIN_EMAILS: optionalString,
  OPENAI_API_KEY: optionalString,
  IP_HASH_SALT: optionalString,
  CRON_SECRET: optionalString,
  MCP_OAUTH_ENABLED: optionalBool,
  MCP_AUTH_CHALLENGE: z.enum(["auto", "http401", "result"]).optional().default("auto"),
  MCP_WIDGET_DOMAIN: optionalString,
  SEO_NOINDEX: optionalBool,
  SEED_ON_BUILD: optionalBool,
  REPORT_AUTOHIDE_THRESHOLD: z.coerce.number().int().min(1).optional().default(3),
  VERCEL: optionalString,
  VERCEL_ENV: optionalString,
  VERCEL_URL: optionalString,
  VERCEL_BRANCH_URL: optionalString,
  VERCEL_PROJECT_PRODUCTION_URL: optionalString,
});

export type ServerEnv = Omit<z.infer<typeof schema>, "BETTER_AUTH_SECRET" | "IP_HASH_SALT"> & {
  BETTER_AUTH_SECRET: string;
  IP_HASH_SALT: string;
};

let cached: ServerEnv | undefined;
let warned = false;

export function parseEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "env")))];
    throw new Error(`Invalid or missing environment variable(s): ${names.join(", ")}`);
  }
  const base = parsed.data;
  const strict = base.VERCEL_ENV === "production" || base.VERCEL_ENV === "preview";
  const missing: string[] = [];
  if (strict && !base.BETTER_AUTH_SECRET) missing.push("BETTER_AUTH_SECRET");
  if (strict && !base.IP_HASH_SALT) missing.push("IP_HASH_SALT");
  if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(", ")}`);

  if (!warned && (!base.BETTER_AUTH_SECRET || !base.IP_HASH_SALT) && base.NODE_ENV !== "test") {
    warned = true;
    console.warn("[env] BETTER_AUTH_SECRET / IP_HASH_SALT not set; using insecure development fallbacks.");
  }
  return {
    ...base,
    BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET ?? DEV_AUTH_SECRET,
    IP_HASH_SALT: base.IP_HASH_SALT ?? DEV_IP_SALT,
  };
}

function load(): ServerEnv {
  return (cached ??= parseEnv());
}

/** Test hook: forget the memoized parse. */
export function resetEnvCache(): void {
  cached = undefined;
  warned = false;
}

export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get: (_t, prop) => (load() as unknown as Record<string | symbol, unknown>)[prop],
  has: (_t, prop) => prop in load(),
  ownKeys: () => Reflect.ownKeys(load()),
  getOwnPropertyDescriptor: (_t, prop) => {
    const v = load() as unknown as Record<string | symbol, unknown>;
    return prop in v ? { enumerable: true, configurable: true, value: v[prop] } : undefined;
  },
});

/** ADMIN_EMAILS as a lowercase Set. Reads process.env directly (no DATABASE_URL requirement). */
export function adminEmails(): Set<string> {
  return new Set((process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * BETTER_AUTH_SECRET with the same strictness as `env` (required on Vercel production/preview, dev fallback elsewhere)
 * but without requiring DATABASE_URL, so the Better Auth CLI can load src/auth/server.ts.
 */
export function authSecret(): string {
  const v = process.env.BETTER_AUTH_SECRET;
  if (v) return v;
  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    throw new Error("Missing required environment variable(s): BETTER_AUTH_SECRET");
  }
  return DEV_AUTH_SECRET;
}
