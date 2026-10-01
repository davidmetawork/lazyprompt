import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, profiles, prompts, saves, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { DEFAULT_PAGE_SIZE, MAX_PAGE } from "@/lib/constants";
import { ratingInputSchema } from "@/lib/validation";
import type { Paginated, PromptCard, Viewer } from "@/lib/types";
import { recountPromptSaves } from "@/server/moderation/counters";
import { getActiveActor, parseInput } from "@/server/moderation/guards";
import { promptCardColumns, toPromptCard, type PromptCardRow } from "@/server/prompts/mappers";
import { enforceRateLimit } from "@/server/rate-limit";

/** Idempotent: saving twice or unsaving something not saved is a no-op. save_count is recomputed from rows. */
export async function setSaved(actor: Viewer, promptId: string, saved: boolean): Promise<{ saved: boolean; saveCount: number }> {
  const me = await getActiveActor(actor);
  const input = parseInput(ratingInputSchema.pick({ promptId: true }), { promptId });
  await enforceRateLimit("save", { userId: me.id, trustLevel: me.trustLevel });

  return db.transaction(async (tx) => {
    const [p] = await tx.select({ id: prompts.id, status: prompts.status }).from(prompts)
      .where(eq(prompts.id, input.promptId)).for("update").limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Prompt not found");
    if (saved) {
      if (p.status !== "published") throw new AppError("NOT_FOUND", "Prompt not found");
      await tx.insert(saves).values({ userId: me.id, promptId: p.id }).onConflictDoNothing();
    } else {
      await tx.delete(saves).where(and(eq(saves.userId, me.id), eq(saves.promptId, p.id)));
    }
    const saveCount = await recountPromptSaves(tx, p.id);
    return { saved, saveCount };
  });
}

/** The user's saved prompts, newest save first. Prompts that are no longer published are not listed. */
export async function listSavedPrompts(userId: string, page: number = 1): Promise<Paginated<PromptCard>> {
  const pageSize = DEFAULT_PAGE_SIZE;
  const pg = Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page), 1), MAX_PAGE) : 1;
  const offset = (pg - 1) * pageSize;
  const where = and(eq(saves.userId, userId), eq(prompts.status, "published"));
  const rows = await db
    .select({ ...promptCardColumns, total: sql<number>`count(*) over()::int` })
    .from(saves)
    .innerJoin(prompts, eq(prompts.id, saves.promptId))
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(where)
    .orderBy(desc(saves.createdAt), desc(prompts.id))
    .limit(pageSize)
    .offset(offset);
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && pg > 1) {
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(saves)
      .innerJoin(prompts, eq(prompts.id, saves.promptId)).where(where);
    total = c?.n ?? 0;
  }
  return {
    items: rows.map((r) => toPromptCard(r as unknown as PromptCardRow)),
    page: pg,
    pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}
