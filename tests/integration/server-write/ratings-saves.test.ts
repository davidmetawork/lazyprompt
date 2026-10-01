import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { appSettings, ratings, saves } from "@/db/schema";
import { ratePrompt, removeRating } from "@/server/ratings";
import { listSavedPrompts, setSaved } from "@/server/saves";
import { getViewerPromptState } from "@/server/prompts/queries";
import { bayesianScore } from "@/server/ranking/score";
import { resetDb } from "../../helpers/db";
import { createPrompt as seedPrompt, createUser } from "../../helpers/factories";
import { ensureCategory, promptRow } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); await ensureCategory("writing"); });

const OLD = new Date(Date.now() - 30 * 86_400_000);

describe("ratePrompt", () => {
  it("upserts with weight 1.0 for trusted/old raters and 0.5 for new ones, recomputing aggregates and bayes_score", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const trusted = await createUser({ trustLevel: 1 });
    const newbie = await createUser({ trustLevel: 0 });
    const old = await createUser({ trustLevel: 0, createdAt: OLD });

    expect(await ratePrompt(trusted, p.id, 5)).toEqual({ ratingAvg: 5, ratingCount: 1, viewerRating: 5 });
    await ratePrompt(newbie, p.id, 3);
    const s = await ratePrompt(old, p.id, 4);
    expect(s).toEqual({ ratingAvg: 4, ratingCount: 3, viewerRating: 4 });

    const row = await promptRow(p.id);
    expect(row.ratingCount).toBe(3);
    expect(row.ratingSum).toBe(12);
    expect(row.ratingWeightSum).toBeCloseTo(2.5);
    expect(row.ratingWeightedSum).toBeCloseTo(5 + 1.5 + 4);
    expect(row.bayesScore).toBeCloseTo(bayesianScore(10.5, 2.5, 4.0), 5);
    const weights = await db.select({ weight: ratings.weight }).from(ratings);
    expect(weights.map((w) => w.weight).sort()).toEqual([0.5, 1, 1]);
  });

  it("re-rating updates the same row (count unchanged) and removeRating is the inverse", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const rater = await createUser({ trustLevel: 1 });
    await ratePrompt(rater, p.id, 2);
    const again = await ratePrompt(rater, p.id, 5);
    expect(again).toEqual({ ratingAvg: 5, ratingCount: 1, viewerRating: 5 });
    expect(await db.select().from(ratings)).toHaveLength(1);
    expect((await promptRow(p.id)).ratingSum).toBe(5);

    expect(await removeRating(rater, p.id)).toEqual({ ratingAvg: null, ratingCount: 0, viewerRating: null });
    const row = await promptRow(p.id);
    expect([row.ratingCount, row.ratingSum, row.ratingWeightSum, row.ratingWeightedSum]).toEqual([0, 0, 0, 0]);
    expect(row.bayesScore).toBeCloseTo(4.0);
    await removeRating(rater, p.id);                                           // idempotent
    expect((await getViewerPromptState(p.id, rater)).rating).toBeNull();
  });

  it("uses the current app_settings ranking.globalMean", async () => {
    await db.insert(appSettings).values({ key: "ranking.globalMean", value: 3.0 });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    await ratePrompt(await createUser({ trustLevel: 1 }), p.id, 5);
    expect((await promptRow(p.id)).bayesScore).toBeCloseTo(bayesianScore(5, 1, 3.0), 5);
  });

  it("authors cannot rate their own prompt; only published prompts can be rated", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    await expect(ratePrompt(author, p.id, 5)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const pending = await seedPrompt(author, { categorySlug: "writing", status: "pending" });
    const rater = await createUser({ trustLevel: 1 });
    await expect(ratePrompt(rater, pending.id, 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ratePrompt(rater, "00000000-0000-4000-8000-000000000000", 5)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.select().from(ratings)).toHaveLength(0);
  });

  it("validates stars and ids, and refuses banned actors", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const rater = await createUser({ trustLevel: 1 });
    for (const bad of [0, 6, 2.5, Number.NaN]) {
      await expect(ratePrompt(rater, p.id, bad)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(ratePrompt(rater, "nope", 3)).rejects.toMatchObject({ code: "VALIDATION" });
    const banned = await createUser({ banned: true });
    await expect(ratePrompt(banned, p.id, 4)).rejects.toMatchObject({ code: "BANNED" });
    await expect(removeRating(banned, p.id)).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("setSaved / listSavedPrompts", () => {
  it("is idempotent and keeps save_count equal to the number of rows", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const a = await createUser();
    const b = await createUser();
    expect(await setSaved(a, p.id, true)).toEqual({ saved: true, saveCount: 1 });
    expect(await setSaved(a, p.id, true)).toEqual({ saved: true, saveCount: 1 });
    expect(await setSaved(b, p.id, true)).toEqual({ saved: true, saveCount: 2 });
    expect((await promptRow(p.id)).saveCount).toBe(2);
    expect(await setSaved(a, p.id, false)).toEqual({ saved: false, saveCount: 1 });
    expect(await setSaved(a, p.id, false)).toEqual({ saved: false, saveCount: 1 });
    expect(await db.select().from(saves).where(and(eq(saves.promptId, p.id)))).toHaveLength(1);
    expect((await promptRow(p.id)).saveCount).toBe(1);
    expect((await getViewerPromptState(p.id, b)).saved).toBe(true);
  });

  it("lists the user's saved prompts newest-first as PromptCards and skips unpublished ones", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p1 = await seedPrompt(author, { categorySlug: "writing", title: "First saved prompt", tags: ["email"] });
    const p2 = await seedPrompt(author, { categorySlug: "writing", title: "Second saved prompt" });
    const me = await createUser();
    await setSaved(me, p1.id, true);
    await new Promise((r) => setTimeout(r, 15));
    await setSaved(me, p2.id, true);
    const page = await listSavedPrompts(me.id);
    expect(page.items.map((i) => i.title)).toEqual(["Second saved prompt", "First saved prompt"]);
    expect(page).toMatchObject({ total: 2, page: 1, hasMore: false });
    expect(page.items[1]).toMatchObject({ tags: ["email"], category: { slug: "writing" }, saveCount: 1, author: { id: author.id } });
    await db.execute(sql`UPDATE prompts SET status = 'hidden' WHERE id = ${p2.id}`);
    expect((await listSavedPrompts(me.id)).items.map((i) => i.title)).toEqual(["First saved prompt"]);
    expect((await listSavedPrompts(me.id, 9)).items).toEqual([]);
    expect((await listSavedPrompts((await createUser()).id)).total).toBe(0);
  });

  it("only published prompts can be saved; ids are validated; banned actors are refused", async () => {
    const author = await createUser({ trustLevel: 1 });
    const pending = await seedPrompt(author, { categorySlug: "writing", status: "pending" });
    const me = await createUser();
    await expect(setSaved(me, pending.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSaved(me, "00000000-0000-4000-8000-000000000000", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSaved(me, "bad-id", true)).rejects.toMatchObject({ code: "VALIDATION" });
    const banned = await createUser({ banned: true });
    await expect(setSaved(banned, pending.id, true)).rejects.toMatchObject({ code: "BANNED" });
  });
});
