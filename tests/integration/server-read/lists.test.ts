import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { promptVersions, prompts } from "@/db/schema";
import { AppError } from "@/lib/errors";
import {
  getHomeSections, getPromptVersion, getRelatedPrompts, listPromptVersions, listPromptsByAuthor, listSitemapEntries,
} from "@/server/prompts/queries";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

describe("getHomeSections", () => {
  it("caps featured at 6 and top/latest at 12", async () => {
    const ada = await createUser();
    for (let i = 0; i < 14; i++) await createPrompt(ada, { title: `Prompt number ${i}`, isFeatured: i < 8, bayesScore: i });
    const s = await getHomeSections();
    expect(s.featured).toHaveLength(6);
    expect(s.top).toHaveLength(12);
    expect(s.latest).toHaveLength(12);
    expect(s.top[0]?.title).toBe("Prompt number 13");
    expect(s.featured.every((p) => p.isFeatured)).toBe(true);
  });

  it("orders trending by trending_score and pads with top results without duplicates", async () => {
    const ada = await createUser();
    const hot: string[] = [];
    for (let i = 0; i < 3; i++) hot.push((await createPrompt(ada, { title: `Hot ${i}`, bayesScore: 0 })).id);
    for (let i = 0; i < 15; i++) await createPrompt(ada, { title: `Plain ${i}`, bayesScore: 1 + i / 100 });
    await db.update(prompts).set({ trendingScore: 9 }).where(eq(prompts.id, hot[0]!));
    await db.update(prompts).set({ trendingScore: 5 }).where(eq(prompts.id, hot[1]!));
    await db.update(prompts).set({ trendingScore: 1 }).where(eq(prompts.id, hot[2]!));

    const { trending } = await getHomeSections();
    expect(trending).toHaveLength(12);
    expect(trending.slice(0, 3).map((p) => p.id)).toEqual(hot);
    expect(new Set(trending.map((p) => p.id)).size).toBe(12);
    expect(trending[3]?.title).toBe("Plain 14");   // padded with the top-ranked remainder
  });

  it("pads fully with top when nothing is trending, and shows only real trending when 12 qualify", async () => {
    const ada = await createUser();
    for (let i = 0; i < 13; i++) await createPrompt(ada, { title: `P ${i}`, bayesScore: i });
    expect((await getHomeSections()).trending.map((p) => p.title)).toEqual((await getHomeSections()).top.map((p) => p.title));

    const lows = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.bayesScore, 0));
    await db.update(prompts).set({ trendingScore: 3 }).where(eq(prompts.id, lows[0]!.id));
    expect((await getHomeSections()).trending[0]?.id).toBe(lows[0]!.id);
  });

  it("excludes unpublished prompts everywhere and works on an empty library", async () => {
    expect(await getHomeSections()).toEqual({ featured: [], trending: [], top: [], latest: [] });
    const ada = await createUser();
    await createPrompt(ada, { title: "Pending", status: "pending", isFeatured: true });
    const s = await getHomeSections();
    expect([s.featured, s.trending, s.top, s.latest].every((l) => l.length === 0)).toBe(true);
  });
});

describe("getRelatedPrompts", () => {
  it("returns same-category or tag-sharing published prompts, tag overlap first, never itself", async () => {
    const ada = await createUser();
    const base = await createPrompt(ada, { title: "Base", categorySlug: "writing", tags: ["email", "sales"] });
    const sameCat = await createPrompt(ada, { title: "Same category only", categorySlug: "writing", tags: ["poems"] });
    const twoTags = await createPrompt(ada, { title: "Two shared tags", categorySlug: "coding", tags: ["email", "sales"] });
    const oneTag = await createPrompt(ada, { title: "One shared tag", categorySlug: "coding", tags: ["email"] });
    await createPrompt(ada, { title: "Unrelated", categorySlug: "coding", tags: ["other"] });
    await createPrompt(ada, { title: "Pending related", categorySlug: "writing", status: "pending" });

    const related = await getRelatedPrompts(base.id);
    expect(related.map((p) => p.id)).toEqual([twoTags.id, oneTag.id, sameCat.id]);
    expect(related.some((p) => p.id === base.id)).toBe(false);
  });

  it("honours limit and validates the id", async () => {
    const ada = await createUser();
    const base = await createPrompt(ada, { categorySlug: "writing" });
    for (let i = 0; i < 4; i++) await createPrompt(ada, { categorySlug: "writing", title: `Sibling ${i}` });
    expect(await getRelatedPrompts(base.id, 2)).toHaveLength(2);
    expect(await getRelatedPrompts(base.id, 999)).toHaveLength(4);
    await expect(getRelatedPrompts("nope")).rejects.toBeInstanceOf(AppError);
    expect(await getRelatedPrompts("11111111-1111-4111-8111-111111111111")).toEqual([]);
  });
});

describe("prompt versions", () => {
  it("lists versions newest first with editors and returns one version in full", async () => {
    const ada = await createUser({ name: "Ada" });
    const p = await createPrompt(ada, { title: "Versioned prompt" });
    await db.insert(promptVersions).values({
      promptId: p.id, version: 2, title: "Versioned prompt v2", description: "Second description that is long enough.",
      body: "Second body with {{topic}}", variables: [{ key: "topic", label: "Topic", type: "text", required: true }],
      exampleOutput: "out", notes: "n", changeNote: "Clarified the task", editorId: ada.id,
    });
    const list = await listPromptVersions(p.id);
    expect(list.map((v) => v.version)).toEqual([2, 1]);
    expect(list[0]).toMatchObject({ title: "Versioned prompt v2", changeNote: "Clarified the task", editor: { id: ada.id, name: "Ada", username: ada.username } });
    expect(typeof list[0]?.createdAt).toBe("string");

    const v2 = await getPromptVersion(p.id, 2);
    expect(v2).toMatchObject({ version: 2, body: "Second body with {{topic}}", exampleOutput: "out", notes: "n", description: "Second description that is long enough." });
    expect(v2?.variables).toHaveLength(1);
    expect((await getPromptVersion(p.id, 1))?.title).toBe("Versioned prompt");
  });

  it("returns null/[] for unknown prompts and versions, and a null editor when the editor was deleted", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada);
    expect(await getPromptVersion(p.id, 99)).toBeNull();
    expect(await listPromptVersions("11111111-1111-4111-8111-111111111111")).toEqual([]);
    await db.update(promptVersions).set({ editorId: null }).where(eq(promptVersions.promptId, p.id));
    expect((await listPromptVersions(p.id))[0]?.editor).toBeNull();
  });

  it("validates ids and version numbers", async () => {
    await expect(listPromptVersions("bad")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(getPromptVersion("bad", 1)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(getPromptVersion("11111111-1111-4111-8111-111111111111", 0)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(getPromptVersion("11111111-1111-4111-8111-111111111111", 1.5)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("listPromptsByAuthor", () => {
  it("shows only published prompts publicly, without status leakage", async () => {
    const ada = await createUser();
    const bob = await createUser();
    const pub = await createPrompt(ada, { title: "Public one" });
    await createPrompt(ada, { title: "Pending one", status: "pending" });
    await createPrompt(bob, { title: "Bob's" });
    const res = await listPromptsByAuthor(ada.id);
    expect(res.items.map((i) => i.id)).toEqual([pub.id]);
    expect(res.items[0]).toMatchObject({ status: "published", moderationNote: null });
    expect(res).toMatchObject({ total: 1, page: 1, hasMore: false });
  });

  it("includes non-public rows with status and moderationNote when asked, but never removed ones", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Live", publishedAt: new Date("2026-01-01") });
    const rejected = await createPrompt(ada, { title: "Rejected one", status: "pending" });
    await db.update(prompts).set({ status: "rejected", moderationNote: "Too vague" }).where(eq(prompts.id, rejected.id));
    await createPrompt(ada, { title: "Deleted one", status: "removed" });
    const res = await listPromptsByAuthor(ada.id, { includeNonPublic: true });
    expect(res.items.map((i) => i.title).sort()).toEqual(["Live", "Rejected one"]);
    expect(res.items.find((i) => i.title === "Rejected one")).toMatchObject({ status: "rejected", moderationNote: "Too vague" });
    expect(res.total).toBe(2);
  });

  it("paginates and validates the page", async () => {
    const ada = await createUser();
    for (let i = 0; i < 26; i++) await createPrompt(ada, { title: `Mine ${i}` });
    const p1 = await listPromptsByAuthor(ada.id, { page: 1 });
    const p2 = await listPromptsByAuthor(ada.id, { page: 2 });
    expect(p1).toMatchObject({ total: 26, hasMore: true, pageSize: 24 });
    expect(p1.items).toHaveLength(24);
    expect(p2.items).toHaveLength(2);
    expect(await listPromptsByAuthor(ada.id, { page: 9 })).toMatchObject({ items: [], total: 26 });
    await expect(listPromptsByAuthor(ada.id, { page: 0 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(listPromptsByAuthor(ada.id, { page: 51 })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("listSitemapEntries", () => {
  it("lists published prompts only with ISO updatedAt", async () => {
    const ada = await createUser();
    const a = await createPrompt(ada, { title: "Sitemap A" });
    await createPrompt(ada, { title: "Sitemap draft", status: "pending" });
    const entries = await listSitemapEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.slug).toBe(a.slug);
    expect(new Date(entries[0]!.updatedAt).toISOString()).toBe(entries[0]!.updatedAt);
  });
});

