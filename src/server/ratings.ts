import "server-only";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { appSettings, prompts, ratings } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { ratingInputSchema } from "@/lib/validation";
import type { RatingSummary, Viewer } from "@/lib/types";
import { recountPromptRatings } from "@/server/moderation/counters";
import { getActiveActor, parseInput } from "@/server/moderation/guards";
import { RANKING, ratingWeight } from "@/server/ranking/score";
import { ratingAverage } from "@/server/prompts/mappers";
import { enforceRateLimit } from "@/server/rate-limit";

const GLOBAL_MEAN_KEY = "ranking.globalMean";

/** Current global mean `m` from app_settings (a bare number, or {value}); defaults to 4.0. */
async function readGlobalMean(tx: Tx): Promise<number> {
  const [row] = await tx.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, GLOBAL_MEAN_KEY)).limit(1);
  const raw = row?.value;
  const n = typeof raw === "number" ? raw : typeof raw === "object" && raw !== null ? Number((raw as { value?: unknown }).value) : Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : RANKING.DEFAULT_MEAN;
}

/** Locks the prompt row (serializes concurrent rating writes) and requires it to be published. */
async function lockPublishedPrompt(tx: Tx, promptId: string): Promise<{ id: string; authorId: string }> {
  const [p] = await tx
    .select({ id: prompts.id, authorId: prompts.authorId, status: prompts.status })
    .from(prompts)
    .where(eq(prompts.id, promptId))
    .for("update")
    .limit(1);
  if (!p || p.status !== "published") throw new AppError("NOT_FOUND", "Prompt not found");
  return p;
}

async function summary(tx: Tx, promptId: string, userId: string): Promise<RatingSummary> {
  const [p] = await tx.select({ n: prompts.ratingCount, sum: prompts.ratingSum }).from(prompts).where(eq(prompts.id, promptId)).limit(1);
  const [mine] = await tx.select({ stars: ratings.stars }).from(ratings)
    .where(and(eq(ratings.promptId, promptId), eq(ratings.userId, userId))).limit(1);
  return { ratingAvg: ratingAverage(p?.sum ?? 0, p?.n ?? 0), ratingCount: p?.n ?? 0, viewerRating: mine?.stars ?? null };
}

/** Creates or updates the viewer's rating (weight from their trust/account age) and recomputes the prompt's aggregates. */
export async function ratePrompt(actor: Viewer, promptId: string, stars: number): Promise<RatingSummary> {
  const me = await getActiveActor(actor);
  const input = parseInput(ratingInputSchema, { promptId, stars });
  await enforceRateLimit("rating", { userId: me.id, trustLevel: me.trustLevel });
  const weight = ratingWeight({ trustLevel: me.trustLevel, accountAgeDays: me.accountAgeDays });

  return db.transaction(async (tx) => {
    const p = await lockPublishedPrompt(tx, input.promptId);
    if (p.authorId === me.id) throw new AppError("FORBIDDEN", "You can't rate your own prompt");
    await tx
      .insert(ratings)
      .values({ userId: me.id, promptId: p.id, stars: input.stars, weight })
      .onConflictDoUpdate({ target: [ratings.userId, ratings.promptId], set: { stars: input.stars, weight, updatedAt: new Date() } });
    await recountPromptRatings(tx, p.id, await readGlobalMean(tx), RANKING.C);
    return summary(tx, p.id, me.id);
  });
}

export async function removeRating(actor: Viewer, promptId: string): Promise<RatingSummary> {
  const me = await getActiveActor(actor);
  const input = parseInput(ratingInputSchema.pick({ promptId: true }), { promptId });
  await enforceRateLimit("rating", { userId: me.id, trustLevel: me.trustLevel });

  return db.transaction(async (tx) => {
    const p = await lockPublishedPrompt(tx, input.promptId);
    await tx.delete(ratings).where(and(eq(ratings.promptId, p.id), eq(ratings.userId, me.id)));
    await recountPromptRatings(tx, p.id, await readGlobalMean(tx), RANKING.C);
    return summary(tx, p.id, me.id);
  });
}
