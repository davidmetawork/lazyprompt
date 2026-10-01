// Usage events (ARCHITECTURE.md sections 3, 4): deduped per prompt/type/actor/day, counters bumped only on a fresh row.
import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { usageEventInputSchema } from "@/lib/validation";
import { EVENT_SOURCES, type USAGE_EVENT_TYPES } from "@/lib/constants";
import type { AiModel, EventSource, UsageEventType } from "@/lib/types";

export interface UsageEventRecord {
  promptId: string; type: UsageEventType; model?: AiModel | null; source: EventSource;
  userId?: string | null; ip?: string | null; userAgent?: string | null;
  /**
   * Explicit actor identity for callers that know better than ip/ua (MCP: the verified user id, else a stable
   * `o:<openai/subject>` key). Hashed like a user id; it wins over `userId`/`ip`/`userAgent`.
   */
  actorKey?: string | null;
}

/** Fixed column map (never built from input): which denormalized counter each event type increments. */
const COUNTER_COLUMN: Record<(typeof USAGE_EVENT_TYPES)[number], string> = {
  copy: "copy_count", open: "open_count", render: "render_count", worked: "worked_count", not_worked: "not_worked_count",
};

/** sha256 hex of `(actorKey | userId | ip + "|" + ua) + "|" + IP_HASH_SALT`. No raw IP or UA is ever stored. */
export function hashActor(input: { userId?: string | null; ip?: string | null; userAgent?: string | null; actorKey?: string | null }): string {
  const subject = input.actorKey ? `k:${input.actorKey}` : input.userId ? input.userId : `${input.ip ?? ""}|${input.userAgent ?? ""}`;
  return createHash("sha256").update(`${subject}|${env.IP_HASH_SALT}`).digest("hex");
}

/**
 * Records one usage event for a PUBLISHED prompt. The unique (prompt, type, actor, day) index dedupes: only a freshly
 * inserted row bumps the matching counter, in the same transaction. Unknown / unpublished prompts and duplicates are
 * `{ counted: false }` (never an error, since this is fed by beacons).
 */
export async function recordUsageEvent(input: UsageEventRecord): Promise<{ counted: boolean }> {
  const parsed = usageEventInputSchema.safeParse({ promptId: input.promptId, type: input.type, model: input.model ?? undefined });
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid usage event");
  if (!(EVENT_SOURCES as readonly string[]).includes(input.source)) throw new AppError("VALIDATION", "Invalid event source");
  const { promptId, type, model } = parsed.data;
  const userId = input.userId ?? null;
  // Anonymous WEB visitors hash the IP only: rotating the user agent must not mint a fresh actor per event.
  // (MCP callers without an actorKey keep ip+ua; they should pass an actorKey.)
  const anonWeb = !userId && !input.actorKey && input.source === "web";
  const actorHash = hashActor({ userId, ip: input.ip, userAgent: anonWeb ? null : input.userAgent, actorKey: input.actorKey });
  const column = sql.raw(COUNTER_COLUMN[type]);

  return db.transaction(async (tx) => {
    const res = await tx.execute<{ id: number }>(sql`
      INSERT INTO usage_events (prompt_id, type, model, source, user_id, actor_hash)
      SELECT p.id, ${type}::usage_event_type, ${model ?? null}::ai_model, ${input.source}::event_source, ${userId}, ${actorHash}
      FROM prompts p WHERE p.id = ${promptId}::uuid AND p.status = 'published'
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    if (res.rows.length === 0) return { counted: false };
    await tx.execute(sql`UPDATE prompts SET ${column} = ${column} + 1 WHERE id = ${promptId}::uuid`);
    return { counted: true };
  });
}
