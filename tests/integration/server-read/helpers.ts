// Direct-insert helpers for the data-read tests. They never call data-write functions (stubs in this branch).
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, ratings, saves, usageEvents } from "@/db/schema";
import type { UsageEventType } from "@/lib/types";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/** `n` anonymous events from distinct actors (distinct actor_hash) of one type, `ageHours` old. */
export async function addAnonEvents(promptId: string, n: number, opts: { type?: UsageEventType; ageHours?: number; tag?: string } = {}): Promise<void> {
  if (n <= 0) return;
  await db.insert(usageEvents).values(Array.from({ length: n }, (_, i) => ({
    promptId,
    type: opts.type ?? "copy",
    actorHash: `anon-${opts.tag ?? ""}-${promptId.slice(0, 8)}-${opts.type ?? "copy"}-${i}`,
    createdAt: hoursAgo(opts.ageHours ?? 0),
  })));
}

export async function addUserEvent(promptId: string, userId: string, type: UsageEventType = "copy", ageHours = 0): Promise<void> {
  await db.insert(usageEvents).values({ promptId, type, userId, actorHash: `user-${userId}-${type}`, createdAt: hoursAgo(ageHours) });
}

export async function addSave(promptId: string, userId: string, ageHours = 0): Promise<void> {
  await db.insert(saves).values({ promptId, userId, createdAt: hoursAgo(ageHours) });
}

export async function addRating(promptId: string, userId: string, stars: number, ageHours = 0): Promise<void> {
  await db.insert(ratings).values({ promptId, userId, stars, createdAt: hoursAgo(ageHours), updatedAt: hoursAgo(ageHours) });
}

export async function addComment(promptId: string, authorId: string, status: "visible" | "pending" | "hidden" | "removed" = "visible", ageHours = 0): Promise<void> {
  await db.insert(comments).values({ promptId, authorId, body: "A comment", status, createdAt: hoursAgo(ageHours) });
}

export async function scores(promptId: string): Promise<{ trending: number; bayes: number }> {
  const r = await db.execute<{ t: number; b: number }>(sql`SELECT trending_score::float8 AS t, bayes_score::float8 AS b FROM prompts WHERE id = ${promptId}::uuid`);
  return { trending: Number(r.rows[0]!.t), bayes: Number(r.rows[0]!.b) };
}

export async function setting(key: string): Promise<unknown> {
  const r = await db.execute<{ value: unknown }>(sql`SELECT value FROM app_settings WHERE key = ${key}`);
  return r.rows[0]?.value;
}
