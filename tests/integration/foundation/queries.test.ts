import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { ensureProfile } from "@/db/profiles";
import { profiles, ratings, saves, user } from "@/db/schema";
import { listCategories, getCategoryBySlug } from "@/server/taxonomy";
import {
  findSimilarPrompts, getHomeSections, getPromptById, getPromptByShortId, getViewerPromptState, listPrompts,
} from "@/server/prompts/queries";
import { resetDb } from "../../helpers/db";
import { createCategory, createPrompt, createUser } from "../../helpers/factories";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

describe("categories", () => {
  it("lists categories in sort order with counts and finds one by slug", async () => {
    const b = await createCategory({ slug: "bbb", name: "Bbb", sortOrder: 2 });
    const a = await createCategory({ slug: "aaa", name: "Aaa", sortOrder: 1 });
    const author = await createUser();
    await createPrompt(author, { categorySlug: "aaa" });
    await createPrompt(author, { categorySlug: "aaa", status: "pending" });

    const cats = await listCategories();
    expect(cats.map((c) => c.slug)).toEqual(["aaa", "bbb"]);
    expect(cats[0]).toMatchObject({ id: a.id, promptCount: 1 });     // published only
    expect(cats[1]).toMatchObject({ id: b.id, promptCount: 0 });
    expect(await getCategoryBySlug("bbb")).toMatchObject({ name: "Bbb" });
    expect(await getCategoryBySlug("missing")).toBeNull();
  });
});

describe("getPromptByShortId / getPromptById", () => {
  it("maps a full PromptDetail with tags, models, author and category", async () => {
    const author = await createUser({ name: "Ada Lovelace" });
    const p = await createPrompt(author, {
      title: "Cold email opener", categorySlug: "writing", tags: ["Email", "outreach"], models: ["chatgpt", "claude"],
      exampleOutput: "Hi there", notes: "Why it works", useCase: "rewrite", ratingCount: 2, ratingSum: 9,
    });
    const d = await getPromptByShortId(p.shortId);
    expect(d).not.toBeNull();
    expect(d).toMatchObject({
      id: p.id, shortId: p.shortId, slug: p.slug, title: "Cold email opener", useCase: "rewrite",
      category: { slug: "writing" }, tags: ["email", "outreach"], models: ["chatgpt", "claude"],
      author: { id: author.id, username: author.username, name: "Ada Lovelace", isSystem: false },
      exampleOutput: "Hi there", notes: "Why it works", ratingAvg: 4.5, ratingCount: 2, version: 1, status: "published",
      variableCount: 1, forkedFrom: null, testedOn: [],
    });
    expect(d?.variables).toEqual([{ key: "topic", label: "Topic", type: "text", required: true }]);
    expect(d?.moderationFlags).toEqual([]);
    expect((await getPromptById(p.id))?.shortId).toBe(p.shortId);
  });

  it("hides non-published prompts unless includeNonPublic", async () => {
    const author = await createUser();
    const draft = await createPrompt(author, { status: "pending" });
    expect(await getPromptByShortId(draft.shortId)).toBeNull();
    expect(await getPromptById(draft.id)).toBeNull();
    expect((await getPromptByShortId(draft.shortId, { includeNonPublic: true }))?.status).toBe("pending");
    expect((await getPromptById(draft.id, { includeNonPublic: true }))?.id).toBe(draft.id);
  });

  it("returns null for unknown ids and malformed uuids", async () => {
    expect(await getPromptByShortId("zzzzzzz")).toBeNull();
    expect(await getPromptById("not-a-uuid")).toBeNull();
    expect(await getPromptById("11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});

describe("listPrompts", () => {
  it("filters by category, tag, model, useCase and author", async () => {
    const ada = await createUser();
    const bob = await createUser();
    const w1 = await createPrompt(ada, { title: "Writing one", categorySlug: "writing", tags: ["email"], models: ["chatgpt"], useCase: "generate" });
    const w2 = await createPrompt(bob, { title: "Writing two", categorySlug: "writing", tags: ["editing"], models: ["claude"], useCase: "rewrite" });
    const c1 = await createPrompt(ada, { title: "Coding one", categorySlug: "coding", tags: ["email"], useCase: "analyze" });  // any model
    await createPrompt(ada, { title: "Hidden", categorySlug: "coding", status: "hidden" });

    const ids = async (input: Parameters<typeof listPrompts>[0]) => (await listPrompts(input)).items.map((i) => i.id).sort();
    expect(await ids({})).toEqual([w1.id, w2.id, c1.id].sort());
    expect(await ids({ category: "writing" })).toEqual([w1.id, w2.id].sort());
    expect(await ids({ tag: "email" })).toEqual([w1.id, c1.id].sort());
    expect(await ids({ model: "claude" })).toEqual([w2.id, c1.id].sort());       // + "any model" prompt
    expect(await ids({ useCase: "rewrite" })).toEqual([w2.id]);
    expect(await ids({ authorId: bob.id })).toEqual([w2.id]);
    expect(await ids({ category: "writing", tag: "email", model: "chatgpt" })).toEqual([w1.id]);
    expect(await ids({ tag: "nope" })).toEqual([]);
  });

  it("resolves tag aliases through alias_of_id", async () => {
    const { tags } = await import("@/db/schema");
    const ada = await createUser();
    const p = await createPrompt(ada, { tags: ["pr-review"] });
    const [canon] = await db.insert(tags).values({ slug: "code-review", name: "Code review" }).returning({ id: tags.id });
    await db.update(tags).set({ aliasOfId: canon!.id }).where(eq(tags.slug, "pr-review"));
    expect((await listPrompts({ tag: "code-review" })).items.map((i) => i.id)).toEqual([p.id]);
    expect((await listPrompts({ tag: "pr-review" })).items.map((i) => i.id)).toEqual([p.id]);
  });

  it("does a simple case-insensitive search on q and escapes LIKE wildcards", async () => {
    const ada = await createUser();
    const hit = await createPrompt(ada, { title: "Weekly Planning Template" });
    await createPrompt(ada, { title: "Something else entirely" });
    await createPrompt(ada, { title: "100% match" });
    expect((await listPrompts({ q: "planning" })).items.map((i) => i.id)).toEqual([hit.id]);
    expect((await listPrompts({ q: "%" })).total).toBe(1);   // only the literal-% title
    expect((await listPrompts({ q: "_" })).total).toBe(0);
  });

  it("sorts top and new, and paginates", async () => {
    const ada = await createUser();
    const old = await createPrompt(ada, { title: "Oldest top", bayesScore: 4.9, publishedAt: new Date("2026-01-01") });
    const mid = await createPrompt(ada, { title: "Middle", bayesScore: 3.0, publishedAt: new Date("2026-02-01") });
    const fresh = await createPrompt(ada, { title: "Freshest", bayesScore: 1.0, publishedAt: new Date("2026-03-01") });

    expect((await listPrompts({ sort: "top" })).items.map((i) => i.id)).toEqual([old.id, mid.id, fresh.id]);
    expect((await listPrompts({ sort: "new" })).items.map((i) => i.id)).toEqual([fresh.id, mid.id, old.id]);
    expect((await listPrompts({})).items[0]?.id).toBe(old.id);            // default sort is top

    const p1 = await listPrompts({ sort: "new", pageSize: 2, page: 1 });
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2, hasMore: true });
    expect(p1.items).toHaveLength(2);
    const p2 = await listPrompts({ sort: "new", pageSize: 2, page: 2 });
    expect(p2).toMatchObject({ total: 3, hasMore: false });
    expect(p2.items.map((i) => i.id)).toEqual([old.id]);
    const p9 = await listPrompts({ sort: "new", pageSize: 2, page: 9 });
    expect(p9).toMatchObject({ items: [], total: 3, hasMore: false });
  });

  it("validates input", async () => {
    await expect(listPrompts({ page: 0 })).rejects.toThrow();
  });
});

describe("getHomeSections", () => {
  it("returns featured, top (also trending) and latest, published only", async () => {
    const ada = await createUser();
    const f = await createPrompt(ada, { title: "Featured one", isFeatured: true, bayesScore: 2 });
    const t = await createPrompt(ada, { title: "Top one", bayesScore: 5 });
    await createPrompt(ada, { title: "Pending one", status: "pending", bayesScore: 9 });
    const s = await getHomeSections();
    expect(s.featured.map((p) => p.id)).toEqual([f.id]);
    expect(s.top.map((p) => p.id)).toEqual([t.id, f.id]);
    expect(s.trending).toEqual(s.top);
    expect(s.latest).toHaveLength(2);
  });
});

describe("getViewerPromptState", () => {
  it("is empty for anonymous viewers", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    expect(await getViewerPromptState(p.id, null)).toEqual({ rating: null, saved: false, isAuthor: false, canEdit: false });
  });

  it("reports rating, saved, authorship and admin edit rights", async () => {
    const author = await createUser();
    const reader = await createUser();
    const admin = await createUser({ role: "admin" });
    const p = await createPrompt(author);
    await db.insert(ratings).values({ userId: reader.id, promptId: p.id, stars: 4 });
    await db.insert(saves).values({ userId: reader.id, promptId: p.id });

    expect(await getViewerPromptState(p.id, reader)).toEqual({ rating: 4, saved: true, isAuthor: false, canEdit: false });
    expect(await getViewerPromptState(p.id, author)).toEqual({ rating: null, saved: false, isAuthor: true, canEdit: true });
    expect(await getViewerPromptState(p.id, admin)).toMatchObject({ isAuthor: false, canEdit: true });
  });
});

describe("findSimilarPrompts", () => {
  it("scores a near-duplicate above 0.85 and an unrelated prompt far lower", async () => {
    const ada = await createUser();
    const body = "You are a senior engineer reviewing a pull request. List blocking issues first, then suggestions, and end with a one line verdict.";
    const orig = await createPrompt(ada, { title: "Senior engineer pull request review", body });
    await createPrompt(ada, { title: "Birthday party planner", body: "Plan a children's birthday party with games, food and a schedule for the afternoon." });

    const dup = await findSimilarPrompts({ title: "Senior engineer pull request review", body });
    expect(dup[0]).toMatchObject({ id: orig.id, slug: orig.slug });
    expect(dup[0]!.similarity).toBeGreaterThan(0.85);

    const near = await findSimilarPrompts({ title: "Senior engineer pull request review!", body: `${body} Be kind.` });
    expect(near[0]?.id).toBe(orig.id);
    expect(near[0]!.similarity).toBeGreaterThan(0.6);

    const unrelated = await findSimilarPrompts({ title: "Quarterly tax filing checklist", body: "List the documents an accountant needs for quarterly tax filing." });
    expect(unrelated.every((r) => r.similarity < 0.5)).toBe(true);
  });

  it("ignores unpublished prompts, honors excludeId and limit", async () => {
    const ada = await createUser();
    const body = "Summarize the meeting notes below into decisions, owners and deadlines, in a short table.";
    const a = await createPrompt(ada, { title: "Meeting notes summarizer", body });
    await createPrompt(ada, { title: "Meeting notes summarizer draft", body, status: "pending" });
    const all = await findSimilarPrompts({ title: "Meeting notes summarizer", body });
    expect(all.map((r) => r.id)).toEqual([a.id]);
    expect(await findSimilarPrompts({ title: "Meeting notes summarizer", body }, { excludeId: a.id })).toEqual([]);
    const b = await createPrompt(ada, { title: "Meeting notes summariser", body });
    expect(await findSimilarPrompts({ title: "Meeting notes summarizer", body }, { limit: 1 })).toHaveLength(1);
    expect(b.id).toBeTruthy();
  });

  it("returns [] for stopword-only input on an empty library", async () => {
    expect(await findSimilarPrompts({ title: "the and of", body: "to be or not to be" })).toEqual([]);
  });
});

describe("ensureProfile", () => {
  it("creates one profile per user, idempotently, with a valid username", async () => {
    await db.insert(user).values({ id: "u_x", name: "Grace Hopper", email: "grace@test.local", emailVerified: true });
    await ensureProfile({ id: "u_x", name: "Grace Hopper", email: "grace@test.local" });
    await ensureProfile({ id: "u_x", name: "Grace Hopper", email: "grace@test.local" });
    const rows = await db.select().from(profiles).where(eq(profiles.userId, "u_x"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.username).toMatch(/^[a-z0-9][a-z0-9_-]{2,29}$/);
    expect(rows[0]).toMatchObject({ trustLevel: 0, isSystem: false });
  });

  it("falls back to the email local part and survives odd names", async () => {
    await db.insert(user).values({ id: "u_y", name: "", email: "someone@test.local", emailVerified: true });
    await ensureProfile({ id: "u_y", name: "", email: "someone@test.local" });
    const [row] = await db.select().from(profiles).where(eq(profiles.userId, "u_y"));
    expect(row?.username.startsWith("someone-")).toBe(true);
  });
});
