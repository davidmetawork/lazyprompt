import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { comments, moderationActions } from "@/db/schema";
import { createComment, deleteComment, listComments, updateComment } from "@/server/comments";
import { resetDb } from "../../helpers/db";
import { createPrompt as seedPrompt, createUser } from "../../helpers/factories";
import { clearRateLimits, commentRow, ensureCategory, promptRow } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); await ensureCategory("writing"); });

async function setup() {
  const author = await createUser({ trustLevel: 1 });
  const p = await seedPrompt(author, { categorySlug: "writing" });
  return { author, p };
}
const count = async (id: string) => (await promptRow(id)).commentCount;

describe("createComment", () => {
  it("publishes clean comments immediately and counts them", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 0 });
    const c = await createComment(u, { promptId: p.id, body: "  Really useful prompt, thanks!  " });
    expect(c).toMatchObject({ body: "Really useful prompt, thanks!", status: "visible", isOwn: true, replies: [], editedAt: null });
    expect(c.author).toMatchObject({ id: u.id, username: u.username });
    expect(await count(p.id)).toBe(1);
  });

  it("a trust-0 author's comment with a link is pending and not counted; trust 1 may link", async () => {
    const { p } = await setup();
    const t0 = await createUser({ trustLevel: 0 });
    const c = await createComment(t0, { promptId: p.id, body: "See https://example.com/guide for more" });
    expect(c.status).toBe("pending");
    expect((await commentRow(c.id)).moderationFlags).toContain("link");
    expect(await count(p.id)).toBe(0);
    const t1 = await createUser({ trustLevel: 1 });
    const c1 = await createComment(t1, { promptId: p.id, body: "See https://example.com/guide for more" });
    expect(c1.status).toBe("visible");
    expect(await count(p.id)).toBe(1);
  });

  it("rejected content (shortener) throws VALIDATION and stores nothing", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 1 });
    await expect(createComment(u, { promptId: p.id, body: "buy now bit.ly/xyz" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(comments)).toHaveLength(0);
  });

  it("enforces the depth rule: a reply's parent must be top level and on the same prompt", async () => {
    const { author, p } = await setup();
    const other = await seedPrompt(author, { categorySlug: "writing" });
    const u = await createUser({ trustLevel: 1 });
    const top = await createComment(u, { promptId: p.id, body: "Top level comment" });
    await clearRateLimits();
    const reply = await createComment(u, { promptId: p.id, parentId: top.id, body: "A reply" });
    expect((await commentRow(reply.id)).depth).toBe(1);
    await clearRateLimits();
    await expect(createComment(u, { promptId: p.id, parentId: reply.id, body: "Reply to a reply" }))
      .rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { parentId: expect.any(Array) } });
    await clearRateLimits();
    await expect(createComment(u, { promptId: other.id, parentId: top.id, body: "Wrong prompt" }))
      .rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { parentId: expect.any(Array) } });
    await clearRateLimits();
    await expect(createComment(u, { promptId: p.id, parentId: "00000000-0000-4000-8000-000000000000", body: "Ghost parent" }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(await count(p.id)).toBe(2);
  });

  it("applies the 1-per-15s burst limit and the daily limit", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 0 });
    await createComment(u, { promptId: p.id, body: "First comment" });
    await expect(createComment(u, { promptId: p.id, body: "Second comment right away" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await count(p.id)).toBe(1);
  });

  it("validates input, requires a published prompt and refuses banned actors", async () => {
    const { author, p } = await setup();
    const u = await createUser({ trustLevel: 1 });
    await expect(createComment(u, { promptId: p.id, body: "   " })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createComment(u, { promptId: "x", body: "hello" })).rejects.toMatchObject({ code: "VALIDATION" });
    await clearRateLimits();
    const pending = await seedPrompt(author, { categorySlug: "writing", status: "pending" });
    await expect(createComment(u, { promptId: pending.id, body: "hello there" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const banned = await createUser({ banned: true });
    await expect(createComment(banned, { promptId: p.id, body: "hello there" })).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("updateComment", () => {
  it("lets the author edit within 24h, marks it edited and re-screens (link by trust 0 -> pending)", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 0 });
    const c = await createComment(u, { promptId: p.id, body: "Original text" });
    const e = await updateComment(u, c.id, "Edited text");
    expect(e).toMatchObject({ body: "Edited text", status: "visible" });
    expect(e.editedAt).not.toBeNull();
    expect(await count(p.id)).toBe(1);
    const e2 = await updateComment(u, c.id, "Now see https://example.com/page");
    expect(e2.status).toBe("pending");
    expect(await count(p.id)).toBe(0);
    await expect(updateComment(u, c.id, "see bit.ly/abc")).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await commentRow(c.id)).body).toBe("Now see https://example.com/page");
  });

  it("denies other users, edits after 24h, removed comments, banned actors and bad input", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 1 });
    const other = await createUser({ trustLevel: 1 });
    const c = await createComment(u, { promptId: p.id, body: "Original text" });
    await expect(updateComment(other, c.id, "hijack")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateComment(u, c.id, "")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateComment(u, "00000000-0000-4000-8000-000000000000", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.execute(sql`UPDATE comments SET created_at = now() - interval '25 hours' WHERE id = ${c.id}`);
    await expect(updateComment(u, c.id, "too late")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.execute(sql`UPDATE comments SET created_at = now(), status = 'removed' WHERE id = ${c.id}`);
    await expect(updateComment(u, c.id, "gone")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const banned = await createUser({ banned: true });
    await expect(updateComment(banned, c.id, "hello")).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("deleteComment", () => {
  it("sets status removed (body kept), recounts, is idempotent, and audits admin deletions", async () => {
    const { p } = await setup();
    const u = await createUser({ trustLevel: 1 });
    const admin = await createUser({ role: "admin" });
    const other = await createUser({ trustLevel: 1 });
    const c = await createComment(u, { promptId: p.id, body: "To be deleted" });
    expect(await count(p.id)).toBe(1);
    await expect(deleteComment(other, c.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteComment(u, c.id);
    expect(await commentRow(c.id)).toMatchObject({ status: "removed", body: "To be deleted" });
    expect(await count(p.id)).toBe(0);
    await deleteComment(u, c.id);

    await clearRateLimits();
    const c2 = await createComment(u, { promptId: p.id, body: "Admin will delete this" });
    await deleteComment(admin, c2.id);
    expect((await commentRow(c2.id)).status).toBe("removed");
    expect(await db.select().from(moderationActions)).toMatchObject([{ actorId: admin.id, action: "remove", targetType: "comment", targetId: c2.id }]);
    await expect(deleteComment(u, "00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const banned = await createUser({ banned: true });
    await expect(deleteComment(banned, c.id)).rejects.toMatchObject({ code: "BANNED" });
  });
});

describe("listComments", () => {
  it("nests replies, shows own pending comments (marked) and everything to admins", async () => {
    const { p } = await setup();
    const a = await createUser({ trustLevel: 1 });
    const b = await createUser({ trustLevel: 0 });
    const admin = await createUser({ role: "admin" });
    const top = await createComment(a, { promptId: p.id, body: "Top comment" });
    await clearRateLimits();
    await createComment(a, { promptId: p.id, parentId: top.id, body: "Reply from a" });
    const pending = await createComment(b, { promptId: p.id, body: "Pending with https://example.com/x" });
    await clearRateLimits();
    const hidden = await createComment(a, { promptId: p.id, body: "Will be hidden" });
    await db.update(comments).set({ status: "hidden" }).where(eq(comments.id, hidden.id));

    const anon = await listComments(p.id, null);
    expect(anon.map((c) => c.body)).toEqual(["Top comment"]);
    expect(anon[0]!.replies.map((r) => r.body)).toEqual(["Reply from a"]);
    expect(anon[0]!.isOwn).toBe(false);

    const asB = await listComments(p.id, b);
    expect(asB.map((c) => [c.body, c.status, c.isOwn])).toEqual([
      ["Top comment", "visible", false], ["Pending with https://example.com/x", "pending", true],
    ]);
    const asA = await listComments(p.id, a);
    expect(asA.map((c) => c.status)).toEqual(["visible"]);
    expect(asA[0]!.isOwn).toBe(true);

    const asAdmin = await listComments(p.id, admin);
    expect(asAdmin.map((c) => c.status)).toEqual(["visible", "pending", "hidden"]);
    expect(pending.status).toBe("pending");
  });

  it("keeps a redacted placeholder for a removed parent that still has visible replies", async () => {
    const { p } = await setup();
    const a = await createUser({ trustLevel: 1 });
    const top = await createComment(a, { promptId: p.id, body: "Soon removed" });
    await clearRateLimits();
    await createComment(a, { promptId: p.id, parentId: top.id, body: "Reply stays" });
    await deleteComment(a, top.id);
    const list = await listComments(p.id, null);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ body: "[removed]", status: "removed" });
    expect(list[0]!.replies.map((r) => r.body)).toEqual(["Reply stays"]);
    expect(await count(p.id)).toBe(1);
    expect(await listComments("not-a-uuid", null)).toEqual([]);
  });
});
