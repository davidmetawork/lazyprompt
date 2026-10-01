import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { tags } from "@/db/schema";
import { getTagBySlug, listPopularTags, listTagsForSitemap, suggestTags } from "@/server/taxonomy";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

async function seedTags(spec: Record<string, number>) {
  for (const [slug, promptCount] of Object.entries(spec)) {
    await db.insert(tags).values({ slug, name: slug.replace(/-/g, " "), promptCount });
  }
}

describe("listTagsForSitemap", () => {
  it("returns every canonical tag with at least 5 prompts, without the 100-row popular-tags clamp", async () => {
    const spec: Record<string, number> = { "tiny-tag": 4, "alias-tag": 9 };
    for (let i = 0; i < 130; i++) spec[`bulk-${String(i).padStart(3, "0")}`] = 5 + (i % 7);
    await seedTags(spec);
    const [canon] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, "bulk-000"));
    await db.update(tags).set({ aliasOfId: canon!.id }).where(eq(tags.slug, "alias-tag"));
    const slugs = (await listTagsForSitemap()).map((t) => t.slug);
    expect(slugs).toHaveLength(130);
    expect(slugs).not.toContain("tiny-tag");
    expect(slugs).not.toContain("alias-tag");
    expect(await listPopularTags(500)).toHaveLength(100);        // the clamp the sitemap used to hit
  });
});

describe("getTagBySlug", () => {
  it("returns a tag summary and null for unknown or invalid slugs", async () => {
    await seedTags({ writing: 4 });
    expect(await getTagBySlug("writing")).toEqual({ slug: "writing", name: "writing", promptCount: 4 });
    expect(await getTagBySlug("WRITING")).toMatchObject({ slug: "writing" });
    expect(await getTagBySlug("missing")).toBeNull();
    expect(await getTagBySlug("   ")).toBeNull();
    expect(await getTagBySlug("%'; --")).toBeNull();
  });

  it("follows aliasOfId to the canonical tag", async () => {
    await seedTags({ "code-review": 7, "pr-review": 1 });
    const [canon] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, "code-review"));
    await db.update(tags).set({ aliasOfId: canon!.id }).where(eq(tags.slug, "pr-review"));
    expect(await getTagBySlug("pr-review")).toEqual({ slug: "code-review", name: "code review", promptCount: 7 });
  });
});

describe("listPopularTags", () => {
  it("orders by prompt count, skips aliases and empty tags, and clamps the limit", async () => {
    await seedTags({ alpha: 5, beta: 9, gamma: 0, delta: 2, "alpha-alias": 8 });
    const [alpha] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, "alpha"));
    await db.update(tags).set({ aliasOfId: alpha!.id }).where(eq(tags.slug, "alpha-alias"));
    expect((await listPopularTags()).map((t) => t.slug)).toEqual(["beta", "alpha", "delta"]);
    expect((await listPopularTags(2)).map((t) => t.slug)).toEqual(["beta", "alpha"]);
    expect(await listPopularTags(1)).toHaveLength(1);
    expect(await listPopularTags(-5)).toHaveLength(1);   // negatives clamp up to 1
    expect(await listPopularTags(0)).toHaveLength(3);    // 0 / NaN fall back to the default
  });

  it("reflects counts maintained by the factories", async () => {
    const ada = await createUser();
    await createPrompt(ada, { tags: ["email"] });
    await createPrompt(ada, { tags: ["email", "sales"] });
    expect(await listPopularTags()).toEqual([
      { slug: "email", name: "email", promptCount: 2 },
      { slug: "sales", name: "sales", promptCount: 1 },
    ]);
  });
});

describe("suggestTags", () => {
  it("matches by prefix, ordered by prompt count, limited to 8 by default", async () => {
    await seedTags({ writing: 3, "writing-style": 9, wrapper: 1 });
    for (let i = 0; i < 10; i++) await db.insert(tags).values({ slug: `wr-extra-${i}`, name: `wr extra ${i}`, promptCount: i });
    const wr = await suggestTags("wri");
    expect(wr.map((t) => t.slug)).toEqual(["writing-style", "writing"]);
    expect((await suggestTags("wr")).length).toBe(8);
    expect(await suggestTags("wr", 3)).toHaveLength(3);
  });

  it("tolerates a typo through trigram similarity and normalizes input", async () => {
    await seedTags({ writing: 3 });
    expect((await suggestTags("writng")).map((t) => t.slug)).toEqual(["writing"]);
    expect((await suggestTags("  WRITI ")).map((t) => t.slug)).toEqual(["writing"]);
  });

  it("escapes LIKE wildcards and returns [] for empty or junk input", async () => {
    await seedTags({ writing: 3, "100-percent": 2 });
    expect(await suggestTags("%")).toEqual([]);
    expect(await suggestTags("_")).toEqual([]);
    expect(await suggestTags("")).toEqual([]);
    expect(await suggestTags("'; drop table tags; --")).toEqual([]);
  });

  it("resolves alias matches to the canonical tag without duplicates", async () => {
    await seedTags({ "code-review": 7, "code-reviews": 1, "pr-review": 1 });
    const [canon] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, "code-review"));
    await db.update(tags).set({ aliasOfId: canon!.id }).where(eq(tags.slug, "code-reviews"));
    expect((await suggestTags("code-rev")).map((t) => t.slug)).toEqual(["code-review"]);
  });
});
