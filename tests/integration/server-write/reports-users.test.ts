import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { moderationActions, profiles, reports } from "@/db/schema";
import { createComment } from "@/server/comments";
import { createReport } from "@/server/reports";
import {
  getProfileByUsername, recomputeActiveTrustLevels, recomputeTrustLevel, updateProfile,
} from "@/server/users";
import { resetDb } from "../../helpers/db";
import { createPrompt as seedPrompt, createUser } from "../../helpers/factories";
import { categoryCount, clearRateLimits, commentRow, ensureCategory, promptRow } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); await ensureCategory("writing"); });

describe("createReport", () => {
  it("fills prompt_id, keeps open_report_count right and rejects duplicate open reports with CONFLICT", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const r1 = await createUser();
    const res = await createReport(r1, { targetType: "prompt", targetId: p.id, reason: "spam", details: "looks like spam" });
    expect(res.autoHidden).toBe(false);
    const [row] = await db.select().from(reports).where(eq(reports.id, res.id));
    expect(row).toMatchObject({ promptId: p.id, reporterId: r1.id, status: "open", details: "looks like spam" });
    expect((await promptRow(p.id)).openReportCount).toBe(1);
    await expect(createReport(r1, { targetType: "prompt", targetId: p.id, reason: "broken" })).rejects.toMatchObject({ code: "CONFLICT" });
    await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "broken" });
    expect((await promptRow(p.id)).openReportCount).toBe(2);
  });

  it("auto-hides a prompt at the threshold of distinct open reporters and logs auto_hide with a null actor", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing", tags: ["email"] });
    expect(await categoryCount("writing")).toBe(1);
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "jailbreak" }));
    expect(results.map((r) => r.autoHidden)).toEqual([false, false, true]);
    const row = await promptRow(p.id);
    expect(row.status).toBe("hidden");
    expect(row.autoHiddenAt).not.toBeNull();
    expect(row.openReportCount).toBe(3);
    expect(await categoryCount("writing")).toBe(0);
    const log = await db.select().from(moderationActions);
    expect(log).toMatchObject([{ actorId: null, action: "auto_hide", targetType: "prompt", targetId: p.id }]);
    // Once hidden, the public can no longer report it.
    await expect(createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "spam" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reports a comment (prompt_id filled) and auto-hides it at the threshold, recounting comment_count", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const commenter = await createUser({ trustLevel: 1 });
    const c = await createComment(commenter, { promptId: p.id, body: "A comment that gets reported" });
    expect((await promptRow(p.id)).commentCount).toBe(1);
    const first = await createReport(await createUser(), { targetType: "comment", targetId: c.id, reason: "harassment" });
    const [row] = await db.select().from(reports).where(eq(reports.id, first.id));
    expect(row!.promptId).toBe(p.id);
    expect((await commentRow(c.id)).openReportCount).toBe(1);
    await createReport(await createUser(), { targetType: "comment", targetId: c.id, reason: "harassment" });
    const third = await createReport(await createUser(), { targetType: "comment", targetId: c.id, reason: "other" });
    expect(third.autoHidden).toBe(true);
    expect((await commentRow(c.id)).status).toBe("hidden");
    expect((await promptRow(p.id)).commentCount).toBe(0);
    expect(await db.select().from(moderationActions)).toMatchObject([{ actorId: null, action: "auto_hide", targetType: "comment" }]);
  });

  it("reports on users go to the queue only (never auto-hide)", async () => {
    const target = await createUser();
    for (let i = 0; i < 4; i++) {
      const r = await createReport(await createUser(), { targetType: "user", targetId: target.id, reason: "harassment" });
      expect(r.autoHidden).toBe(false);
    }
    expect(await db.select().from(moderationActions)).toHaveLength(0);
    expect((await db.select().from(reports)).every((r) => r.promptId === null && r.status === "open")).toBe(true);
  });

  it("denies self-reports, unknown targets, bad input and banned actors; applies the report rate limit", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    await expect(createReport(author, { targetType: "prompt", targetId: p.id, reason: "spam" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createReport(author, { targetType: "user", targetId: author.id, reason: "spam" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const u = await createUser();
    await expect(createReport(u, { targetType: "prompt", targetId: "00000000-0000-4000-8000-000000000000", reason: "spam" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createReport(u, { targetType: "comment", targetId: "nope", reason: "spam" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createReport(u, { targetType: "user", targetId: "ghost", reason: "spam" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createReport(u, { targetType: "prompt", targetId: p.id, reason: "bogus" as never })).rejects.toMatchObject({ code: "VALIDATION" });
    const banned = await createUser({ banned: true });
    await expect(createReport(banned, { targetType: "prompt", targetId: p.id, reason: "spam" })).rejects.toMatchObject({ code: "BANNED" });
    await clearRateLimits();
    const target = await createUser();
    for (let i = 0; i < 20; i++) {
      // A different target each time would need 20 users; repeat the same report and tolerate the CONFLICT.
      await createReport(u, { targetType: "user", targetId: target.id, reason: "spam" }).catch((e) => expect(e.code).toBe("CONFLICT"));
    }
    await expect(createReport(u, { targetType: "user", targetId: target.id, reason: "spam" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("profiles", () => {
  it("getProfileByUsername is case-insensitive and returns null when unknown", async () => {
    const u = await createUser({ name: "Grace Hopper", trustLevel: 2 });
    await db.update(profiles).set({ bio: "Compilers", publishedPromptCount: 4 }).where(eq(profiles.userId, u.id));
    const page = await getProfileByUsername(u.username.toUpperCase());
    expect(page).toMatchObject({
      userId: u.id, username: u.username, name: "Grace Hopper", bio: "Compilers", website: null, trustLevel: 2,
      publishedPromptCount: 4, isSystem: false, image: null,
    });
    expect(page!.joinedAt).toBe(u.createdAt);
    expect(await getProfileByUsername("nobody-here")).toBeNull();
    expect(await getProfileByUsername("   ")).toBeNull();
  });

  it("updateProfile saves username, bio and website; CONFLICT on a taken username; validates; refuses banned", async () => {
    const a = await createUser();
    const b = await createUser();
    const page = await updateProfile(a, { username: "ada-l", bio: "  Math  ", website: "https://ada.example.com" });
    expect(page).toMatchObject({ userId: a.id, username: "ada-l", bio: "Math", website: "https://ada.example.com" });
    const cleared = await updateProfile(a, { username: "ada-l", website: "" });
    expect(cleared).toMatchObject({ bio: null, website: null });
    await expect(updateProfile(b, { username: "ada-l" })).rejects.toMatchObject({ code: "CONFLICT", fieldErrors: { username: expect.any(Array) } });
    await expect(updateProfile(b, { username: "ADA-L" as never })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateProfile(b, { username: "ok-name", website: "http://insecure.example.com" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await updateProfile(a, { username: "ada-l", bio: "again" })).toMatchObject({ bio: "again" });     // keeping your own name is fine
    const banned = await createUser({ banned: true });
    await expect(updateProfile(banned, { username: "zzz-banned" })).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("trust levels", () => {
  it("promotes to level 1 with 2 published prompts", async () => {
    const u = await createUser({ trustLevel: 0 });
    await seedPrompt(u, { categorySlug: "writing" });
    expect(await recomputeTrustLevel(u.id)).toBe(0);
    await seedPrompt(u, { categorySlug: "writing" });
    expect(await recomputeTrustLevel(u.id)).toBe(1);
    expect((await getProfileByUsername(u.username))?.trustLevel).toBe(1);
  });

  it("promotes accounts at least 7 days old with 3 visible comments and no upheld reports", async () => {
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const old = await createUser({ createdAt: new Date(Date.now() - 8 * 86_400_000) });
    const fresh = await createUser();
    for (const u of [old, fresh]) {
      for (let i = 0; i < 3; i++) { await clearRateLimits(); await createComment(u, { promptId: p.id, body: `Comment number ${i}` }); }
    }
    expect(await recomputeTrustLevel(fresh.id)).toBe(0);              // too young
    expect(await recomputeTrustLevel(old.id)).toBe(1);

    const old2 = await createUser({ createdAt: new Date(Date.now() - 8 * 86_400_000) });
    let first = "";
    for (let i = 0; i < 3; i++) {
      await clearRateLimits();
      const c = await createComment(old2, { promptId: p.id, body: `Another comment ${i}` });
      if (i === 0) first = c.id;
    }
    await db.insert(reports).values({ reporterId: author.id, targetType: "comment", targetId: first, reason: "spam", status: "actioned" });
    expect(await recomputeTrustLevel(old2.id)).toBe(0);               // an upheld report blocks the comment path
  });

  it("never changes levels 2 and 3, respects manual set_trust decisions, and 404s unknown users", async () => {
    const staff = await createUser({ trustLevel: 2 });
    await seedPrompt(staff, { categorySlug: "writing" });
    expect(await recomputeTrustLevel(staff.id)).toBe(2);
    const pinned = await createUser({ trustLevel: 1 });
    await db.insert(moderationActions).values({ actorId: staff.id, targetType: "user", targetId: pinned.id, action: "set_trust" });
    expect(await recomputeTrustLevel(pinned.id)).toBe(1);             // would be 0 by activity, but an admin set it
    await expect(recomputeTrustLevel("ghost")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("recomputeActiveTrustLevels looks only at recently active users and returns the number changed", async () => {
    const active = await createUser({ trustLevel: 0 });
    await seedPrompt(active, { categorySlug: "writing" });
    await seedPrompt(active, { categorySlug: "writing" });
    const stale = await createUser({ trustLevel: 0 });
    for (let i = 0; i < 2; i++) await seedPrompt(stale, { categorySlug: "writing" });
    await db.execute(sql`UPDATE prompts SET created_at = now() - interval '10 days', published_at = now() - interval '10 days' WHERE author_id = ${stale.id}`);
    const idle = await createUser({ trustLevel: 0 });

    expect(await recomputeActiveTrustLevels()).toBe(1);
    expect((await getProfileByUsername(active.username))?.trustLevel).toBe(1);
    expect((await getProfileByUsername(stale.username))?.trustLevel).toBe(0);
    expect((await getProfileByUsername(idle.username))?.trustLevel).toBe(0);
    expect(await recomputeActiveTrustLevels()).toBe(0);               // nothing left to change
    expect(await recomputeActiveTrustLevels(30)).toBe(1);             // a wider window picks up the stale user
    expect((await getProfileByUsername(stale.username))?.trustLevel).toBe(1);
  });
});
