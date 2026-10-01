import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { comments, moderationActions, profiles, promptVersions, reports, session, usageEvents, user } from "@/db/schema";
import { createComment } from "@/server/comments";
import { createPrompt, updatePrompt } from "@/server/prompts/mutations";
import { getPromptVersion, listPromptVersions } from "@/server/prompts/queries";
import { createReport } from "@/server/reports";
import { ratePrompt } from "@/server/ratings";
import {
  getAdminStats, getModerationQueue, listAdminPrompts, listAdminUsers, listModerationLog, listReports,
} from "@/server/moderation/queue";
import {
  moderateComment, moderatePrompt, moderatePromptVersion, resolveReport, setTrustLevel, setUserBan,
} from "@/server/moderation/actions";
import { resetDb } from "../../helpers/db";
import { createPrompt as seedPrompt, createUser } from "../../helpers/factories";
import { categoryCount, clearRateLimits, commentRow, ensureCategory, promptInput, promptRow, publishedCount, tagCount } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); await ensureCategory("writing"); });

const GHOST = "00000000-0000-4000-8000-000000000000";
const logRows = () => db.select().from(moderationActions);

describe("queue reads require an admin", () => {
  it("throws FORBIDDEN for a non-admin viewer on every read, and UNAUTHENTICATED for none", async () => {
    const u = await createUser({ trustLevel: 2 });
    const reads: [string, () => Promise<unknown>][] = [
      ["getModerationQueue", () => getModerationQueue(u, { kind: "prompt" })],
      ["getModerationQueue(comment)", () => getModerationQueue(u, { kind: "comment" })],
      ["listReports", () => listReports(u, {})],
      ["getAdminStats", () => getAdminStats(u)],
      ["listModerationLog", () => listModerationLog(u)],
      ["listAdminUsers", () => listAdminUsers(u, {})],
      ["listAdminPrompts", () => listAdminPrompts(u, {})],
    ];
    for (const [name, fn] of reads) {
      await expect(fn(), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(getAdminStats(null as never)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects a viewer that only claims to be an admin (role is re-checked in the database)", async () => {
    const u = await createUser();
    const fake = { ...u, role: "admin" as const };
    await expect(moderatePrompt(fake, GHOST, "approve")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setTrustLevel(fake, u.id, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("queue reads", () => {
  it("lists pending prompts oldest first with author trust and flags; and pending comments", async () => {
    const admin = await createUser({ role: "admin" });
    const t0 = await createUser({ trustLevel: 0, name: "Newbie" });
    const first = await createPrompt(t0, promptInput({ title: "First pending prompt" }));
    await new Promise((r) => setTimeout(r, 10));
    await clearRateLimits();
    await createPrompt(t0, promptInput({ title: "Second pending prompt" }));
    await seedPrompt(t0, { categorySlug: "writing" });                                    // published: not in the queue
    const q = await getModerationQueue(admin, { kind: "prompt" });
    expect(q.total).toBe(2);
    expect(q.items.map((i) => i.title)).toEqual(["First pending prompt", "Second pending prompt"]);
    expect(q.items[0]).toMatchObject({
      kind: "prompt", id: first.id, promptSlug: first.slug, flags: ["new_user"], openReportCount: 0,
      author: { id: t0.id, username: t0.username, trustLevel: 0, accountCreatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) },
    });

    const commenter = await createUser({ trustLevel: 0 });
    const p = await seedPrompt(t0, { categorySlug: "writing" });
    const c = await createComment(commenter, { promptId: p.id, body: "Look at https://example.com/promo" });
    const cq = await getModerationQueue(admin, { kind: "comment" });
    expect(cq.items).toHaveLength(1);
    expect(cq.items[0]).toMatchObject({ kind: "comment", id: c.id, excerpt: "Look at https://example.com/promo", flags: ["link"], promptSlug: p.slug });
  });

  it("lists reports with sameTargetOpenCount, targets and the status filter", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing", title: "Reported prompt" });
    const r1 = await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "broken", details: "does not work" });
    const target = await createUser();
    await createReport(await createUser(), { targetType: "user", targetId: target.id, reason: "harassment" });

    const open = await listReports(admin, {});
    expect(open.total).toBe(3);
    const promptReports = open.items.filter((i) => i.targetType === "prompt");
    expect(promptReports.map((i) => i.sameTargetOpenCount)).toEqual([2, 2]);
    expect(promptReports[0]).toMatchObject({ id: r1.id, target: { label: "Reported prompt", href: `/p/${p.slug}`, status: "published" }, status: "open" });
    expect(promptReports[1]).toMatchObject({ details: "does not work", reason: "broken" });
    const userReport = open.items.find((i) => i.targetType === "user")!;
    expect(userReport).toMatchObject({ sameTargetOpenCount: 1, target: { label: target.username, href: `/u/${target.username}`, status: "active" } });

    await resolveReport(admin, r1.id, "dismissed");
    expect((await listReports(admin, { status: "dismissed" })).total).toBe(2);
    expect((await listReports(admin, { status: "open" })).total).toBe(1);
  });

  it("computes admin stats, the audit log, users and prompts", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser({ trustLevel: 0, email: "findme@test.local" });
    const pub = await seedPrompt(u, { categorySlug: "writing", title: "Published searchable prompt" });
    await seedPrompt(u, { categorySlug: "writing", status: "pending" });
    await seedPrompt(u, { categorySlug: "writing", status: "hidden" });
    await db.insert(usageEvents).values([
      { promptId: pub.id, type: "copy", actorHash: "a" }, { promptId: pub.id, type: "copy", actorHash: "b" },
      { promptId: pub.id, type: "open", actorHash: "a" },
    ]);
    await moderatePrompt(admin, pub.id, "feature");

    expect(await getAdminStats(admin)).toEqual({
      pendingPrompts: 1, pendingComments: 0, openReports: 0, hiddenPrompts: 1, usersTotal: 2, usersLast7d: 2, promptsPublished: 1,
      events7d: { copy: 2, open: 1, render: 0, worked: 0, not_worked: 0 },
    });

    const log = await listModerationLog(admin);
    expect(log.items).toMatchObject([{
      action: "feature", targetType: "prompt", targetId: pub.id, actor: { id: admin.id },
      target: { label: "Published searchable prompt", href: `/p/${pub.slug}` },
    }]);

    const users = await listAdminUsers(admin, { q: "findme" });
    expect(users.items).toMatchObject([{ id: u.id, email: "findme@test.local", promptCount: 3, role: "user", banned: false }]);
    expect((await listAdminUsers(admin, {})).total).toBe(2);
    expect((await listAdminUsers(admin, { q: "100%_" })).total).toBe(0);                  // LIKE wildcards are escaped

    expect((await listAdminPrompts(admin, {})).total).toBe(3);
    const hidden = await listAdminPrompts(admin, { status: "hidden" });
    expect(hidden.items).toMatchObject([{ status: "hidden", moderationFlags: [] }]);
    expect((await listAdminPrompts(admin, { q: "searchable" })).items.map((i) => i.title)).toEqual(["Published searchable prompt"]);
  });
});

describe("moderatePrompt", () => {
  it("approve publishes, sets published_at, recounts everything and recomputes the author's trust", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 0 });
    const a = await createPrompt(author, promptInput({ tags: ["email"] }));
    await clearRateLimits();
    const b = await createPrompt(author, promptInput({ tags: ["email"] }));
    expect(await categoryCount("writing")).toBe(0);
    await moderatePrompt(admin, a.id, "approve");
    let row = await promptRow(a.id);
    expect(row).toMatchObject({ status: "published", reviewedById: admin.id, moderationNote: null });
    expect(row.publishedAt).not.toBeNull();
    expect(row.reviewedAt).not.toBeNull();
    expect(await categoryCount("writing")).toBe(1);
    expect(await tagCount("email")).toBe(1);
    expect(await publishedCount(author)).toBe(1);
    expect((await db.select().from(profiles).where(eq(profiles.userId, author.id)))[0]!.trustLevel).toBe(0);
    await moderatePrompt(admin, b.id, "approve");                                          // 2nd published prompt -> trust 1
    expect((await db.select().from(profiles).where(eq(profiles.userId, author.id)))[0]!.trustLevel).toBe(1);
    expect(await categoryCount("writing")).toBe(2);
    const publishedAt = (await promptRow(a.id)).publishedAt;
    await moderatePrompt(admin, a.id, "approve");                                          // no-op, no extra audit row
    expect((await promptRow(a.id)).publishedAt).toEqual(publishedAt);
    expect((await logRows()).filter((l) => l.action === "approve")).toHaveLength(2);
    row = await promptRow(b.id);
    expect(row.status).toBe("published");
  });

  it("reject stores the reason as the moderation note", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 0 });
    const a = await createPrompt(author, promptInput());
    await moderatePrompt(admin, a.id, "reject", "Too generic");
    expect(await promptRow(a.id)).toMatchObject({ status: "rejected", moderationNote: "Too generic", reviewedById: admin.id });
    expect(await logRows()).toMatchObject([{ action: "reject", reason: "Too generic", targetId: a.id, actorId: admin.id }]);
  });

  it("hide / restore / remove / feature / unfeature keep counters and the audit log right", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing", tags: ["email"] });
    await moderatePrompt(admin, p.id, "feature");
    expect((await promptRow(p.id)).isFeatured).toBe(true);
    await moderatePrompt(admin, p.id, "hide", "Under review");
    expect(await promptRow(p.id)).toMatchObject({ status: "hidden", isFeatured: false, moderationNote: "Under review" });
    expect(await categoryCount("writing")).toBe(0);
    expect(await tagCount("email")).toBe(0);
    expect(await publishedCount(author)).toBe(0);
    await expect(moderatePrompt(admin, p.id, "feature")).rejects.toMatchObject({ code: "CONFLICT" });
    await moderatePrompt(admin, p.id, "restore");
    expect(await promptRow(p.id)).toMatchObject({ status: "published", moderationNote: null, autoHiddenAt: null });
    expect(await categoryCount("writing")).toBe(1);
    await moderatePrompt(admin, p.id, "remove", "Policy violation");
    expect(await promptRow(p.id)).toMatchObject({ status: "removed" });
    expect((await promptRow(p.id)).removedAt).not.toBeNull();
    expect(await categoryCount("writing")).toBe(0);
    await expect(moderatePrompt(admin, p.id, "hide")).rejects.toMatchObject({ code: "CONFLICT" });
    await moderatePrompt(admin, p.id, "restore");
    expect((await promptRow(p.id)).status).toBe("published");
    await moderatePrompt(admin, p.id, "feature");
    await moderatePrompt(admin, p.id, "unfeature");
    expect((await promptRow(p.id)).isFeatured).toBe(false);
    expect((await logRows()).map((l) => l.action)).toEqual([
      "feature", "hide", "restore", "remove", "restore", "feature", "unfeature",
    ]);
  });

  it("removing a fork lowers the parent's fork_count", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser({ trustLevel: 1 });
    const parent = await seedPrompt(u, { categorySlug: "writing" });
    const fork = await createPrompt(u, promptInput({ forkedFromShortId: parent.shortId }));
    expect((await promptRow(parent.id)).forkCount).toBe(1);
    await moderatePrompt(admin, fork.id, "remove");
    expect((await promptRow(parent.id)).forkCount).toBe(0);
  });

  it("denies non-admins and banned admins, and 404s unknown prompts; validates reason length", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(u, { categorySlug: "writing" });
    await expect(moderatePrompt(u, p.id, "hide")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moderatePrompt(admin, GHOST, "hide")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moderatePrompt(admin, p.id, "hide", "x".repeat(501))).rejects.toMatchObject({ code: "VALIDATION" });
    const bannedAdmin = await createUser({ role: "admin", banned: true });
    await expect(moderatePrompt(bannedAdmin, p.id, "hide")).rejects.toMatchObject({ code: "BANNED" });
    expect((await promptRow(p.id)).status).toBe("published");
  });
});

describe("moderateComment", () => {
  it("approve / hide / restore / remove keep comment_count equal to the visible comments", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const t0 = await createUser({ trustLevel: 0 });
    const c = await createComment(t0, { promptId: p.id, body: "Pending https://example.com/x" });
    expect((await promptRow(p.id)).commentCount).toBe(0);
    await moderateComment(admin, c.id, "approve");
    expect((await commentRow(c.id)).status).toBe("visible");
    expect((await promptRow(p.id)).commentCount).toBe(1);
    await moderateComment(admin, c.id, "hide", "Off topic");
    expect((await promptRow(p.id)).commentCount).toBe(0);
    await moderateComment(admin, c.id, "restore");
    expect((await promptRow(p.id)).commentCount).toBe(1);
    await moderateComment(admin, c.id, "remove");
    expect((await commentRow(c.id)).status).toBe("removed");
    expect((await promptRow(p.id)).commentCount).toBe(0);
    await expect(moderateComment(admin, c.id, "hide")).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await logRows()).map((l) => [l.action, l.targetType])).toEqual([
      ["approve", "comment"], ["hide", "comment"], ["restore", "comment"], ["remove", "comment"],
    ]);
  });

  it("denies non-admins and 404s unknown comments", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser({ trustLevel: 1 });
    await expect(moderateComment(u, GHOST, "hide")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moderateComment(admin, GHOST, "hide")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("resolveReport", () => {
  it("resolves ALL open reports for the same target, resets open_report_count and logs once", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const other = await seedPrompt(author, { categorySlug: "writing" });
    const r1 = await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "broken" });
    await createReport(await createUser(), { targetType: "prompt", targetId: other.id, reason: "spam" });
    await resolveReport(admin, r1.id, "actioned", "Confirmed spam");
    const rows = await db.select().from(reports);
    expect(rows.filter((r) => r.targetId === p.id).every((r) => r.status === "actioned" && r.resolvedById === admin.id && r.resolutionNote === "Confirmed spam" && r.resolvedAt)).toBe(true);
    expect(rows.find((r) => r.targetId === other.id)!.status).toBe("open");
    expect((await promptRow(p.id)).openReportCount).toBe(0);
    expect((await promptRow(other.id)).openReportCount).toBe(1);
    expect(await logRows()).toMatchObject([{ action: "resolve_report", targetType: "prompt", targetId: p.id, reason: "Confirmed spam", metadata: { resolvedReports: 2 } }]);
    await expect(resolveReport(admin, r1.id, "dismissed")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("tolerateResolved makes the moderate-then-resolve sequence safe: no throw and no second audit entry", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const r1 = await createReport(await createUser(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    await moderatePrompt(admin, p.id, "hide", "Spam");
    await resolveReport(admin, r1.id, "actioned", "Spam", { tolerateResolved: true });
    // Something else already closed the report (another admin, a double click): still no error, still one entry.
    await resolveReport(admin, r1.id, "actioned", "Spam", { tolerateResolved: true });
    expect((await logRows()).map((l) => l.action).sort()).toEqual(["hide", "resolve_report"]);
    await expect(resolveReport(admin, r1.id, "actioned")).rejects.toMatchObject({ code: "CONFLICT" });   // strict by default
  });

  it("dismissed logs dismiss_report; works for comments and users; denies non-admins; 404s unknown", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    const commenter = await createUser({ trustLevel: 1 });
    const c = await createComment(commenter, { promptId: p.id, body: "A reportable comment" });
    const rc = await createReport(await createUser(), { targetType: "comment", targetId: c.id, reason: "spam" });
    const target = await createUser();
    const ru = await createReport(await createUser(), { targetType: "user", targetId: target.id, reason: "other" });
    await resolveReport(admin, rc.id, "dismissed");
    await resolveReport(admin, ru.id, "actioned");
    expect((await commentRow(c.id)).openReportCount).toBe(0);
    expect((await logRows()).map((l) => l.action).sort()).toEqual(["dismiss_report", "resolve_report"]);
    await expect(resolveReport(await createUser(), rc.id, "dismissed")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveReport(admin, GHOST, "dismissed")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(resolveReport(admin, rc.id, "bogus" as never)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("setUserBan / setTrustLevel", () => {
  it("forbids banning yourself, even as an admin", async () => {
    const admin = await createUser({ role: "admin" });
    await expect(setUserBan(admin, admin.id, { banned: true, reason: "oops" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.select().from(user).where(eq(user.id, admin.id)))[0]!.banned).toBe(false);
    expect(await logRows()).toHaveLength(0);
  });

  it("bans: updates user.banned/ban_reason, deletes the user's sessions, and later writes throw BANNED; unban restores", async () => {
    const admin = await createUser({ role: "admin" });
    const victim = await createUser({ trustLevel: 1 });
    const bystander = await createUser();
    const future = new Date(Date.now() + 86_400_000);
    await db.insert(session).values([
      { id: "s1", token: "t1", userId: victim.id, expiresAt: future, updatedAt: new Date() },
      { id: "s2", token: "t2", userId: victim.id, expiresAt: future, updatedAt: new Date() },
      { id: "s3", token: "t3", userId: bystander.id, expiresAt: future, updatedAt: new Date() },
    ]);
    const p = await seedPrompt(await createUser({ trustLevel: 1 }), { categorySlug: "writing" });

    await setUserBan(admin, victim.id, { banned: true, reason: "Spamming" });
    const [row] = await db.select().from(user).where(eq(user.id, victim.id));
    expect(row).toMatchObject({ banned: true, banReason: "Spamming", banExpires: null });
    expect((await db.select().from(session)).map((s) => s.userId)).toEqual([bystander.id]);
    expect(await logRows()).toMatchObject([{ action: "ban", targetType: "user", targetId: victim.id, reason: "Spamming", actorId: admin.id }]);

    // The Viewer object is stale (banned: false) but the database wins.
    await expect(createPrompt(victim, promptInput())).rejects.toMatchObject({ code: "BANNED" });
    await expect(ratePrompt(victim, p.id, 5)).rejects.toMatchObject({ code: "BANNED" });
    await expect(createComment(victim, { promptId: p.id, body: "still here?" })).rejects.toMatchObject({ code: "BANNED" });

    await setUserBan(admin, victim.id, { banned: false });
    expect((await db.select().from(user).where(eq(user.id, victim.id)))[0]).toMatchObject({ banned: false, banReason: null });
    await ratePrompt(victim, p.id, 5);
    expect((await logRows()).map((l) => l.action)).toEqual(["ban", "unban"]);
  });

  it("denies non-admins, 404s unknown users and validates the reason", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser();
    await expect(setUserBan(u, admin.id, { banned: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setUserBan(admin, "ghost", { banned: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setUserBan(admin, u.id, { banned: true, reason: "x".repeat(501) })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("setTrustLevel updates the profile, logs set_trust and validates the level", async () => {
    const admin = await createUser({ role: "admin" });
    const u = await createUser({ trustLevel: 0 });
    await setTrustLevel(admin, u.id, 2);
    expect((await db.select().from(profiles).where(eq(profiles.userId, u.id)))[0]!.trustLevel).toBe(2);
    expect(await logRows()).toMatchObject([{ action: "set_trust", targetType: "user", targetId: u.id, metadata: { from: 0, to: 2 } }]);
    await expect(setTrustLevel(admin, u.id, 7 as never)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setTrustLevel(admin, "ghost", 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setTrustLevel(u, u.id, 3)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("auto-hide then moderation", () => {
  it("an auto-hidden prompt can be restored by an admin", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const p = await seedPrompt(author, { categorySlug: "writing" });
    for (let i = 0; i < 3; i++) await createReport(await createUser({ trustLevel: 1 }), { targetType: "prompt", targetId: p.id, reason: "spam" });
    expect((await promptRow(p.id)).status).toBe("hidden");
    await moderatePrompt(admin, p.id, "restore");
    expect(await promptRow(p.id)).toMatchObject({ status: "published", autoHiddenAt: null });
    expect(await categoryCount("writing")).toBe(1);
  });
});


const trusted = () => createUser({ trustLevel: 1 });

describe("report lifecycle", () => {
  it("restoring an auto-hidden prompt dismisses its open reports, so one new report cannot re-hide it", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await seedPrompt(await trusted(), { categorySlug: "writing" });
    for (let i = 0; i < 3; i++) await createReport(await trusted(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    expect((await promptRow(p.id)).status).toBe("hidden");

    await moderatePrompt(admin, p.id, "restore");
    const rows = await db.select().from(reports).where(eq(reports.targetId, p.id));
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "dismissed" && r.resolvedById === admin.id && r.resolvedAt !== null)).toBe(true);
    expect(await promptRow(p.id)).toMatchObject({ status: "published", openReportCount: 0, autoHiddenAt: null });
    expect((await logRows()).find((l) => l.action === "restore")?.metadata).toMatchObject({ dismissedReports: 3 });

    const again = await createReport(await trusted(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    expect(again.autoHidden).toBe(false);
    expect((await promptRow(p.id)).status).toBe("published");
  });

  it("approving a rejected prompt dismisses stale open reports and records the approved version", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await seedPrompt(await trusted(), { categorySlug: "writing", status: "rejected" });
    await db.insert(reports).values({ reporterId: (await trusted()).id, targetType: "prompt", targetId: p.id, promptId: p.id, reason: "spam" });
    await moderatePrompt(admin, p.id, "approve");
    expect(await promptRow(p.id)).toMatchObject({ status: "published", openReportCount: 0, approvedFromVersion: 1 });
    expect((await db.select().from(reports))[0]).toMatchObject({ status: "dismissed", resolvedById: admin.id });
  });

  it("dismissing the reports of an auto-hidden prompt puts it back (and logs a restore)", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await seedPrompt(await trusted(), { categorySlug: "writing" });
    const first = await createReport(await trusted(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    for (let i = 0; i < 2; i++) await createReport(await trusted(), { targetType: "prompt", targetId: p.id, reason: "spam" });
    expect((await promptRow(p.id)).status).toBe("hidden");
    expect(await categoryCount("writing")).toBe(0);

    await resolveReport(admin, first.id, "dismissed", "False alarm");
    expect(await promptRow(p.id)).toMatchObject({ status: "published", autoHiddenAt: null, openReportCount: 0 });
    expect(await categoryCount("writing")).toBe(1);
    expect((await logRows()).map((l) => l.action).sort()).toEqual(["auto_hide", "dismiss_report", "restore"]);
  });

  it("a dismissal never un-hides content an admin hid, nor an auto-hide the admin confirmed", async () => {
    const admin = await createUser({ role: "admin" });
    const manual = await seedPrompt(await trusted(), { categorySlug: "writing" });
    const r1 = await createReport(await trusted(), { targetType: "prompt", targetId: manual.id, reason: "spam" });
    await moderatePrompt(admin, manual.id, "hide", "Spammy");
    await resolveReport(admin, r1.id, "dismissed");
    expect((await promptRow(manual.id)).status).toBe("hidden");

    const auto = await seedPrompt(await trusted(), { categorySlug: "writing" });
    let last = r1;
    for (let i = 0; i < 3; i++) last = await createReport(await trusted(), { targetType: "prompt", targetId: auto.id, reason: "spam" });
    expect((await promptRow(auto.id)).status).toBe("hidden");
    await moderatePrompt(admin, auto.id, "hide", "Confirmed");   // takes ownership of the automatic hide
    expect((await promptRow(auto.id)).autoHiddenAt).toBeNull();
    await resolveReport(admin, last.id, "dismissed");
    expect((await promptRow(auto.id)).status).toBe("hidden");
  });

  it("comments: dismissing un-hides an auto-hidden comment, restore dismisses its reports, admin hides stay hidden", async () => {
    const admin = await createUser({ role: "admin" });
    const p = await seedPrompt(await trusted(), { categorySlug: "writing" });
    const commenter = await trusted();
    const mk = async (body: string) => { await clearRateLimits(); return createComment(commenter, { promptId: p.id, body }); };

    const a = await mk("Auto-hidden then dismissed");
    const ra = await createReport(await trusted(), { targetType: "comment", targetId: a.id, reason: "spam" });
    for (let i = 0; i < 2; i++) await createReport(await trusted(), { targetType: "comment", targetId: a.id, reason: "spam" });
    expect((await commentRow(a.id)).status).toBe("hidden");
    await resolveReport(admin, ra.id, "dismissed");
    expect(await commentRow(a.id)).toMatchObject({ status: "visible", openReportCount: 0 });
    expect((await promptRow(p.id)).commentCount).toBe(1);

    const b = await mk("Auto-hidden then restored");
    for (let i = 0; i < 3; i++) await createReport(await trusted(), { targetType: "comment", targetId: b.id, reason: "spam" });
    expect((await commentRow(b.id)).status).toBe("hidden");
    await moderateComment(admin, b.id, "restore");
    expect(await commentRow(b.id)).toMatchObject({ status: "visible", openReportCount: 0 });
    expect((await db.select().from(reports).where(eq(reports.targetId, b.id))).every((r) => r.status === "dismissed")).toBe(true);

    const c = await mk("Hidden by an admin");
    const rc = await createReport(await trusted(), { targetType: "comment", targetId: c.id, reason: "spam" });
    await moderateComment(admin, c.id, "hide");
    await resolveReport(admin, rc.id, "dismissed");
    expect((await commentRow(c.id)).status).toBe("hidden");
    expect(await db.select().from(comments).where(eq(comments.promptId, p.id))).toHaveLength(3);
  });
});

describe("version history gating and redaction", () => {
  it("never serves versions from before the first approval; a trusted author's clean publish serves them all", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 0 });
    const input = promptInput();
    const c = await createPrompt(author, input);
    expect(c.status).toBe("pending");
    expect((await promptRow(c.id)).approvedFromVersion).toBeNull();
    await clearRateLimits();
    await updatePrompt(author, c.id, { ...input, body: `${input.body} Also mention the deadline.` });
    expect((await promptRow(c.id)).version).toBe(2);

    await moderatePrompt(admin, c.id, "approve");
    expect((await promptRow(c.id)).approvedFromVersion).toBe(2);
    expect((await listPromptVersions(c.id)).map((v) => v.version)).toEqual([2]);
    expect(await getPromptVersion(c.id, 1)).toBeNull();
    expect((await getPromptVersion(c.id, 2))?.version).toBe(2);
    // Approving again (or restoring later) never moves the boundary.
    await moderatePrompt(admin, c.id, "hide");
    await moderatePrompt(admin, c.id, "restore");
    expect((await promptRow(c.id)).approvedFromVersion).toBe(2);

    const t = await createUser({ trustLevel: 1 });
    const direct = await createPrompt(t, promptInput());
    expect(direct.status).toBe("published");
    expect((await promptRow(direct.id)).approvedFromVersion).toBe(1);
    await clearRateLimits();
    await updatePrompt(t, direct.id, { ...promptInput(), title: "A brand new title for v2" });
    expect((await listPromptVersions(direct.id)).map((v) => v.version)).toEqual([2, 1]);
  });

  it("moderatePromptVersion redacts an earlier version, audits it and refuses the current version", async () => {
    const admin = await createUser({ role: "admin" });
    const author = await createUser({ trustLevel: 1 });
    const input = promptInput({ notes: "Original notes" });
    const c = await createPrompt(author, input);
    await clearRateLimits();
    await updatePrompt(author, c.id, { ...input, body: `${input.body} Now with extra detail added.`, changeNote: "More detail" });

    await expect(moderatePromptVersion(author, c.id, 1, "I want it gone")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(moderatePromptVersion(admin, c.id, 2, "Current version")).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(moderatePromptVersion(admin, c.id, 9, "No such version")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(moderatePromptVersion(admin, c.id, 1, "x")).rejects.toMatchObject({ code: "VALIDATION" });

    await moderatePromptVersion(admin, c.id, 1, "Contains a phone number");
    const [v1] = await db.select().from(promptVersions).where(eq(promptVersions.promptId, c.id)).orderBy(promptVersions.version);
    expect(v1).toMatchObject({ version: 1, title: "[redacted]", body: "[redacted]", notes: "[redacted]", changeNote: "[redacted]", variables: [] });
    expect(await getPromptVersion(c.id, 1)).toMatchObject({ body: "[redacted]", changeNote: "[redacted]" });
    expect((await promptRow(c.id)).body).toContain("extra detail");     // the live prompt is untouched
    const audit = (await logRows()).filter((l) => l.metadata && (l.metadata as { via?: string }).via === "redact_version");
    expect(audit).toMatchObject([{ actorId: admin.id, targetType: "prompt", targetId: c.id, reason: "Contains a phone number", metadata: { version: 1 } }]);
    // The admin log shows it as a redaction, never as "prompt removed".
    expect((await listModerationLog(admin)).items).toMatchObject([{ action: "redact_version", targetType: "prompt", targetId: c.id }]);
    await moderatePromptVersion(admin, c.id, 1, "Again");               // idempotent: no second audit row
    expect((await logRows()).filter((l) => (l.metadata as { via?: string }).via === "redact_version")).toHaveLength(1);
  });
});
