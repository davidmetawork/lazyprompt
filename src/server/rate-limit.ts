import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env, rateLimitsRelaxedForE2e } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { TrustLevel } from "@/lib/types";

export type LimitedAction =
  | "prompt_create" | "prompt_update" | "comment" | "comment_update" | "delete" | "profile" | "rating" | "save" | "report"
  | "event" | "mcp" | "tag_suggest" | "search";

const MAX_KEY = 200;

function safeKey(key: string): string {
  return key.length <= MAX_KEY ? key : `h:${createHash("sha256").update(key).digest("hex")}`;
}

/**
 * Fixed-window counter in ONE upsert. A denied call still increments the counter.
 * ok = count <= limit within the current window.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }> {
  const k = safeKey(key);
  const w = windowSeconds;
  const res = await db.execute<{ count: number; age_seconds: number }>(sql`
    INSERT INTO app_rate_limits (key, window_start, count) VALUES (${k}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${w}::double precision)
                   THEN 1 ELSE app_rate_limits.count + 1 END,
      window_start = CASE WHEN app_rate_limits.window_start < now() - make_interval(secs => ${w}::double precision)
                          THEN now() ELSE app_rate_limits.window_start END
    RETURNING count, extract(epoch from (now() - window_start))::float8 AS age_seconds
  `);
  const row = res.rows[0];
  if (!row) throw new Error("rate limit upsert returned no row");
  const count = Number(row.count);
  const age = Number(row.age_seconds);
  const ok = count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil(w - age)),
  };
}

/** Salted hash so raw IPs are never stored (IP_HASH_SALT). */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}|${env.IP_HASH_SALT}`).digest("hex").slice(0, 32);
}

interface Rule { limit: number; windowSeconds: number }
const DAY = 86_400;

const POLICY: Record<Exclude<LimitedAction, "mcp" | "comment" | "comment_update">, { low: Rule; high: Rule }> = {
  prompt_create: { low: { limit: 3, windowSeconds: DAY }, high: { limit: 15, windowSeconds: DAY } },
  prompt_update: { low: { limit: 30, windowSeconds: DAY }, high: { limit: 30, windowSeconds: DAY } },
  rating: { low: { limit: 200, windowSeconds: DAY }, high: { limit: 200, windowSeconds: DAY } },
  save: { low: { limit: 300, windowSeconds: DAY }, high: { limit: 300, windowSeconds: DAY } },
  report: { low: { limit: 20, windowSeconds: DAY }, high: { limit: 20, windowSeconds: DAY } },
  event: { low: { limit: 300, windowSeconds: 3600 }, high: { limit: 300, windowSeconds: 3600 } },
  tag_suggest: { low: { limit: 60, windowSeconds: 60 }, high: { limit: 60, windowSeconds: 60 } },
  delete: { low: { limit: 60, windowSeconds: DAY }, high: { limit: 60, windowSeconds: DAY } },
  profile: { low: { limit: 10, windowSeconds: DAY }, high: { limit: 10, windowSeconds: DAY } },
  // Typo-correction scans (zero-result searches), keyed by IP hash.
  search: { low: { limit: 30, windowSeconds: 60 }, high: { limit: 30, windowSeconds: 60 } },
};

async function enforce(key: string, rule: Rule, what: string): Promise<void> {
  const r = await checkRateLimit(key, rule.limit, rule.windowSeconds);
  if (!r.ok) {
    throw new AppError("RATE_LIMITED", `Too many ${what}. Try again in ${r.retryAfterSeconds}s.`);
  }
}

/**
 * Applies the section 11 policy; throws AppError RATE_LIMITED.
 * Subject: `userId` when signed in, otherwise a hash of `ip`. `ip` may be raw; it is salted+hashed before use.
 * For "mcp", `userId` is the rate-limit SUBJECT (verified token user id, else params._meta["openai/subject"]);
 * when absent the IP hash is the subject. The per-IP-hash ceiling is 600/min when no subject was resolved (anonymous
 * traffic) and 3000/min (a separate counter) when one was, so shared ChatGPT/Claude egress IPs serving many
 * authenticated users are not throttled as one client.
 */
export async function enforceRateLimit(
  action: LimitedAction,
  subject: { userId?: string; ip?: string; trustLevel?: TrustLevel },
): Promise<void> {
  if (rateLimitsRelaxedForE2e()) return;   // Playwright web server only; ignored on Vercel
  const ipHash = subject.ip ? hashIp(subject.ip) : undefined;
  const who = subject.userId ?? (ipHash ? `ip:${ipHash}` : "anon");

  if (action === "mcp") {
    await enforce(`mcp:s:${who}`, { limit: 120, windowSeconds: 60 }, "requests");
    if (ipHash) {
      if (subject.userId) await enforce(`mcp:ipu:${ipHash}`, { limit: 3000, windowSeconds: 60 }, "requests");
      else await enforce(`mcp:ip:${ipHash}`, { limit: 600, windowSeconds: 60 }, "requests");
    }
    return;
  }

  const trusted = (subject.trustLevel ?? 0) >= 1;

  if (action === "comment") {
    const rule = trusted ? { limit: 100, windowSeconds: DAY } : { limit: 20, windowSeconds: DAY };
    await enforce(`comment_burst:${who}`, { limit: 1, windowSeconds: 15 }, "comments");
    await enforce(`comment:${who}`, rule, "comments");
    return;
  }

  if (action === "comment_update") {
    // Every edit is re-screened (possibly an OpenAI call) and locks the prompt row, so it is limited like creating one.
    await enforce(`comment_update_burst:${who}`, { limit: 1, windowSeconds: 5 }, "comment edits");
    await enforce(`comment_update:${who}`, { limit: 30, windowSeconds: DAY }, "comment edits");
    return;
  }

  const entry = POLICY[action];
  await enforce(`${action}:${who}`, trusted ? entry.high : entry.low, "requests");
}

/** x-real-ip, then the first x-forwarded-for entry. */
export function clientIp(headers: Headers): string | null {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return null;
}
