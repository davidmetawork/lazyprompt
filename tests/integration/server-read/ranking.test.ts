import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { appRateLimits, appSettings, prompts, usageEvents } from "@/db/schema";
import { listPrompts } from "@/server/prompts/queries";
import { maybeRecomputeRankings, recomputeRankings, runMaintenance } from "@/server/ranking/recompute";
import { recordUsageEvent } from "@/server/usage";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";
import { addAnonEvents, addComment, addRating, addSave, addUserEvent, scores, setting } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

describe("recomputeRankings: trending", () => {
  it("scores recent events above old ones (72h half-life)", async () => {
    const ada = await createUser();
    const fresh = await createPrompt(ada, { title: "Fresh" });
    const aged = await createPrompt(ada, { title: "Aged" });
    const stale = await createPrompt(ada, { title: "Stale" });
    await addAnonEvents(fresh.id, 3, { ageHours: 0 });
    await addAnonEvents(aged.id, 3, { ageHours: 72 });
    await addAnonEvents(stale.id, 3, { ageHours: 24 * 8 });   // outside the 7-day window
    const r = await recomputeRankings();
    expect(r.prompts).toBe(3);
    const [f, a, s] = await Promise.all([scores(fresh.id), scores(aged.id), scores(stale.id)]);
    expect(f.trending).toBeCloseTo(3, 1);
    expect(a.trending).toBeCloseTo(1.5, 1);
    expect(s.trending).toBe(0);
    expect(f.trending).toBeGreaterThan(a.trending);
    expect((await listPrompts({ sort: "trending" })).items.map((i) => i.id).slice(0, 2)).toEqual([fresh.id, aged.id]);
  });

  it("applies the event weights: copy 1, open 2, worked 2, render 1, save 3, rating>=4 3, visible comment 2", async () => {
    const ada = await createUser();
    const [u1, u2, u3, u4, u5, u6] = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    const p = await createPrompt(ada);
    await addUserEvent(p.id, u1!.id, "copy");       // 1
    await addUserEvent(p.id, u2!.id, "open");       // 2
    await addUserEvent(p.id, u3!.id, "worked");     // 2
    await addUserEvent(p.id, u4!.id, "render");     // 1
    await addSave(p.id, u5!.id);                    // 3
    await addRating(p.id, u6!.id, 5);               // 3
    await addComment(p.id, u1!.id, "visible");      // 2 (u1 again: same actor, still counted for weight)
    await addComment(p.id, u2!.id, "hidden");       // ignored
    await addRating(p.id, u3!.id, 3);               // ignored (< 4)
    await addUserEvent(p.id, u4!.id, "not_worked"); // weight 0
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBeCloseTo(1 + 2 + 2 + 1 + 3 + 3 + 2, 1);
  });

  it("scores 0 below 3 distinct actors and counts a signed-in user once across event + save + rating", async () => {
    const ada = await createUser();
    const [u1, u2, u3] = await Promise.all([createUser(), createUser(), createUser()]);
    const p = await createPrompt(ada);
    await addUserEvent(p.id, u1.id, "copy");
    await addSave(p.id, u1.id);
    await addRating(p.id, u1.id, 5);
    await addComment(p.id, u1.id);
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBe(0);      // four sources, ONE actor

    await addUserEvent(p.id, u2.id, "copy");
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBe(0);      // two actors

    await addSave(p.id, u3.id);
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBeGreaterThan(0);   // three actors
  });

  it("counts anonymous actors by actor_hash and signed-in actors by user id", async () => {
    const ada = await createUser();
    const u1 = await createUser();
    const p = await createPrompt(ada);
    await addAnonEvents(p.id, 1, { tag: "a" });
    await addAnonEvents(p.id, 1, { tag: "b" });
    await addUserEvent(p.id, u1.id, "copy");
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBeGreaterThan(0);

    const q = await createPrompt(ada);
    await db.insert(usageEvents).values([
      { promptId: q.id, type: "copy", actorHash: "same", userId: u1.id },
      { promptId: q.id, type: "open", actorHash: "same-2", userId: u1.id },
      { promptId: q.id, type: "render", actorHash: "other" },
    ]);
    await recomputeRankings();
    expect((await scores(q.id)).trending).toBe(0);      // user u1 twice + one anon = 2 actors
  });

  it("dedupes the same actor copying twice on one day (one event, one point)", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    const input = { promptId: p.id, type: "copy" as const, source: "web" as const };
    for (const ip of ["1.1.1.1", "1.1.1.2", "1.1.1.3"]) {
      await recordUsageEvent({ ...input, ip, userAgent: "ua" });
      await recordUsageEvent({ ...input, ip, userAgent: "ua" });
    }
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBeCloseTo(3, 1);   // not 6
  });

  it("ignores non-published prompts and resets nothing it should not touch", async () => {
    const ada = await createUser();
    const pend = await createPrompt(ada, { status: "pending" });
    await addAnonEvents(pend.id, 3);
    const r = await recomputeRankings();
    expect(r.prompts).toBe(0);
    expect((await scores(pend.id)).trending).toBe(0);
  });

  it("zeroes a score that has decayed out of the window or lost its actors", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    await db.update(prompts).set({ trendingScore: 42 }).where(eq(prompts.id, p.id));
    await recomputeRankings();
    expect((await scores(p.id)).trending).toBe(0);
  });
});

describe("recomputeRankings: bayes and global mean", () => {
  it("ranks one 5-star rating below 30 ratings averaging 4.7 in sort=top", async () => {
    const ada = await createUser();
    const lucky = await createPrompt(ada, { title: "One lucky rating", ratingCount: 1, ratingSum: 5 });
    const solid = await createPrompt(ada, { title: "Thirty solid ratings", ratingCount: 30, ratingSum: 141 });
    const none = await createPrompt(ada, { title: "Unrated" });
    await recomputeRankings();
    const top = (await listPrompts({ sort: "top" })).items.map((i) => i.id);
    expect(top).toEqual([solid.id, lucky.id, none.id]);
    const [s, l, n] = await Promise.all([scores(solid.id), scores(lucky.id), scores(none.id)]);
    expect(s.bayes).toBeCloseTo((8 * 4 + 141) / 38, 4);
    expect(l.bayes).toBeCloseTo((8 * 4 + 5) / 9, 4);
    expect(n.bayes).toBeCloseTo(4.0, 6);
  });

  it("uses the weighted sums when present", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada, { ratingCount: 2, ratingSum: 10 });
    await db.update(prompts).set({ ratingWeightSum: 1.5, ratingWeightedSum: 7.5 }).where(eq(prompts.id, p.id));
    await recomputeRankings();
    expect((await scores(p.id)).bayes).toBeCloseTo((8 * 4 + 7.5) / (8 + 1.5), 4);
  });

  it("defaults the global mean to 4.0 below 50 ratings and writes the settings", async () => {
    const ada = await createUser();
    await createPrompt(ada, { ratingCount: 10, ratingSum: 20 });
    const r = await recomputeRankings();
    expect(r.globalMean).toBe(4.0);
    expect(await setting("ranking.globalMean")).toBe(4);
    const at = await setting("ranking.computedAt");
    expect(typeof at).toBe("string");
    expect(Math.abs(Date.now() - Date.parse(at as string))).toBeLessThan(60_000);
  });

  it("computes the weighted global mean from 50 ratings up, over published prompts only", async () => {
    const ada = await createUser();
    await createPrompt(ada, { ratingCount: 30, ratingSum: 60 });   // mean 2.0
    await createPrompt(ada, { ratingCount: 30, ratingSum: 90 });   // mean 3.0
    await createPrompt(ada, { status: "pending", ratingCount: 100, ratingSum: 500 });   // ignored
    const r = await recomputeRankings();
    expect(r.globalMean).toBeCloseTo(150 / 60, 6);
    expect(Number(await setting("ranking.globalMean"))).toBeCloseTo(2.5, 6);
    const rows = await db.select({ b: prompts.bayesScore, s: prompts.ratingSum }).from(prompts).where(eq(prompts.status, "published"));
    expect(rows.find((x) => x.s === 60)!.b).toBeCloseTo((8 * 2.5 + 60) / 38, 4);
  });

  it("is idempotent and updates the existing settings row in place", async () => {
    const ada = await createUser();
    await createPrompt(ada);
    await recomputeRankings();
    await recomputeRankings();
    const rows = await db.select().from(appSettings);
    expect(rows.map((r) => r.key).sort()).toEqual(["ranking.computedAt", "ranking.globalMean"]);
  });
});

describe("maybeRecomputeRankings", () => {
  it("recomputes when never computed, then no-ops while fresh", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    await maybeRecomputeRankings();
    const first = await setting("ranking.computedAt");
    expect(typeof first).toBe("string");

    await addAnonEvents(p.id, 3);
    await maybeRecomputeRankings();
    expect(await setting("ranking.computedAt")).toBe(first);
    expect((await scores(p.id)).trending).toBe(0);   // skipped: the new events were not folded in
  });

  it("recomputes once computedAt is more than 10 minutes old", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    await addAnonEvents(p.id, 3);
    const old = new Date(Date.now() - 11 * 60_000).toISOString();
    await db.insert(appSettings).values({ key: "ranking.computedAt", value: old });
    await maybeRecomputeRankings();
    expect((await scores(p.id)).trending).toBeGreaterThan(0);
    expect(Date.parse((await setting("ranking.computedAt")) as string)).toBeGreaterThan(Date.parse(old));
  });

  it("skips when the advisory lock is held elsewhere", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    await addAnonEvents(p.id, 3);
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(4242)`);
      await maybeRecomputeRankings();   // different connection: pg_try_advisory_xact_lock returns false
    });
    expect(await setting("ranking.computedAt")).toBeUndefined();
    expect((await scores(p.id)).trending).toBe(0);
  });

  it("never throws, even when the stored timestamp is garbage", async () => {
    await db.insert(appSettings).values({ key: "ranking.computedAt", value: { not: "a date" } });
    await expect(maybeRecomputeRankings()).resolves.toBeUndefined();
  });
});

describe("runMaintenance", () => {
  it("deletes usage events older than 90 days and rate-limit rows older than 2 days, only", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    const day = (n: number) => new Date(Date.now() - n * 86_400_000);
    await db.insert(usageEvents).values([
      { promptId: p.id, type: "copy", actorHash: "old1", createdAt: day(91) },
      { promptId: p.id, type: "copy", actorHash: "old2", createdAt: day(120) },
      { promptId: p.id, type: "copy", actorHash: "keep1", createdAt: day(89) },
      { promptId: p.id, type: "copy", actorHash: "keep2", createdAt: day(0) },
    ]);
    await db.insert(appRateLimits).values([
      { key: "a:old", windowStart: day(3), count: 5 },
      { key: "a:older", windowStart: day(30), count: 1 },
      { key: "a:keep", windowStart: day(1), count: 2 },
    ]);
    expect(await runMaintenance()).toEqual({ eventsDeleted: 2, limitsDeleted: 2 });
    expect((await db.select().from(usageEvents)).map((e) => e.actorHash).sort()).toEqual(["keep1", "keep2"]);
    expect((await db.select().from(appRateLimits)).map((r) => r.key)).toEqual(["a:keep"]);
    expect(await runMaintenance()).toEqual({ eventsDeleted: 0, limitsDeleted: 0 });
  });
});
