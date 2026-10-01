import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { appRateLimits, prompts, tags } from "@/db/schema";
import { listPrompts } from "@/server/prompts/queries";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

const titles = async (input: Parameters<typeof listPrompts>[0]) => (await listPrompts(input)).items.map((i) => i.title);

describe("listPrompts search relevance", () => {
  it("ranks a title match above a body-only match", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Quarterly planning agenda", body: "Draft the agenda and mention the budget once somewhere in this long body text." });
    await createPrompt(ada, { title: "Budget review checklist", body: "A checklist for reviewing a team spend report, line by line, with questions to ask." });
    expect(await titles({ q: "budget" })).toEqual(["Budget review checklist", "Quarterly planning agenda"]);
  });

  it("defaults to relevance when q is present and top otherwise", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Alpha newsletter", bayesScore: 1 });
    await createPrompt(ada, { title: "Newsletter newsletter newsletter", bayesScore: 0 });
    await createPrompt(ada, { title: "Unrelated", bayesScore: 5 });
    expect((await titles({ q: "newsletter" }))[0]).toBe("Newsletter newsletter newsletter");
    expect((await titles({}))[0]).toBe("Unrelated");
    expect((await titles({ q: "newsletter", sort: "relevance" })).length).toBe(2);
  });

  it("matches stems (emails finds email) and tags/description through the search vector", async () => {
    const ada = await createUser();
    const a = await createPrompt(ada, { title: "Cold email opener" });
    const b = await createPrompt(ada, { title: "Untitled helper", tags: ["outreach"] });
    expect((await listPrompts({ q: "emails" })).items.map((i) => i.id)).toEqual([a.id]);
    expect((await listPrompts({ q: "outreach" })).items.map((i) => i.id)).toEqual([b.id]);
  });

  it("supports websearch syntax: quoted phrases and exclusion", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Email to sales leads" });
    await createPrompt(ada, { title: "Email to friends" });
    expect(await titles({ q: "email -sales" })).toEqual(["Email to friends"]);
    expect(await titles({ q: '"email to friends"' })).toEqual(["Email to friends"]);
  });

  it("only returns published prompts", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Visible resume tips" });
    await createPrompt(ada, { title: "Pending resume tips", status: "pending" });
    await createPrompt(ada, { title: "Hidden resume tips", status: "hidden" });
    expect(await titles({ q: "resume" })).toEqual(["Visible resume tips"]);
  });
});

describe("listPrompts typo tolerance", () => {
  it("finds 'email' when the query is 'emial'", async () => {
    const ada = await createUser();
    const hit = await createPrompt(ada, { title: "Cold email opener" });
    await createPrompt(ada, { title: "Birthday party planner" });
    expect((await listPrompts({ q: "emial" })).items.map((i) => i.id)).toEqual([hit.id]);
  });

  it("corrects several tokens and tag words", async () => {
    const ada = await createUser();
    const hit = await createPrompt(ada, { title: "Weekly status report", tags: ["management"] });
    expect((await listPrompts({ q: "wekly staus" })).items.map((i) => i.id)).toEqual([hit.id]);
    expect((await listPrompts({ q: "managment" })).items.map((i) => i.id)).toEqual([hit.id]);
  });

  it("only attempts correction for short queries (at most 3 tokens and 40 characters)", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Cold email opener" });
    const searchKeys = async () =>
      (await db.select().from(appRateLimits)).filter((r) => r.key.startsWith("search:")).length;
    expect((await listPrompts({ q: "emial" })).total).toBe(1);                             // 1 token: corrected
    expect(await searchKeys()).toBe(1);
    await db.delete(appRateLimits);
    await listPrompts({ q: "zzzq yyyq xxxq wwwq" });                                       // 4 tokens: no correction attempt
    await listPrompts({ q: "zzzq".repeat(11) });                                           // over 40 characters
    expect(await searchKeys()).toBe(0);
  });

  it("rate limits the correction path per IP and falls back to the uncorrected (empty) result", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Cold email opener" });
    const ip = "203.0.113.50";
    for (let i = 0; i < 30; i++) expect((await listPrompts({ q: "emial" }, { ip })).total).toBe(1);
    expect((await listPrompts({ q: "emial" }, { ip })).total).toBe(0);                     // limit hit: no correction, no error
    expect((await listPrompts({ q: "email" }, { ip })).total).toBe(1);                     // real matches never need the budget
    expect((await listPrompts({ q: "emial" }, { ip: "203.0.113.51" })).total).toBe(1);     // another client is unaffected
  });

  it("does not 'correct' gibberish into results", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Cold email opener" });
    expect((await listPrompts({ q: "qxzvbnm" })).total).toBe(0);
  });
});

describe("listPrompts filters with search", () => {
  it("combines q with category, tag, model, useCase and authorId", async () => {
    const ada = await createUser();
    const bob = await createUser();
    const hit = await createPrompt(ada, { title: "Support reply writer", categorySlug: "support", tags: ["email"], models: ["claude"], useCase: "rewrite" });
    await createPrompt(ada, { title: "Support reply tracker", categorySlug: "ops", tags: ["email"], models: ["claude"], useCase: "rewrite" });
    await createPrompt(ada, { title: "Support reply analyst", categorySlug: "support", tags: ["email"], models: ["gemini"], useCase: "rewrite" });
    await createPrompt(bob, { title: "Support reply helper", categorySlug: "support", tags: ["email"], models: ["claude"], useCase: "rewrite" });
    await createPrompt(ada, { title: "Support reply coach", categorySlug: "support", tags: ["other"], models: ["claude"], useCase: "rewrite" });
    await createPrompt(ada, { title: "Support reply planner", categorySlug: "support", tags: ["email"], models: ["claude"], useCase: "plan" });

    const res = await listPrompts({ q: "support reply", category: "support", tag: "email", model: "claude", useCase: "rewrite", authorId: ada.id });
    expect(res.items.map((i) => i.id)).toEqual([hit.id]);
    expect(res.total).toBe(1);
  });

  it("treats prompts with no model rows as 'any model' for the model filter", async () => {
    const ada = await createUser();
    const any = await createPrompt(ada, { title: "Anywhere summarizer" });
    const claude = await createPrompt(ada, { title: "Claude summarizer", models: ["claude"] });
    await createPrompt(ada, { title: "Gemini summarizer", models: ["gemini"] });
    const ids = (await listPrompts({ q: "summarizer", model: "claude" })).items.map((i) => i.id).sort();
    expect(ids).toEqual([any.id, claude.id].sort());
    expect((await listPrompts({ model: "grok" })).items.map((i) => i.id)).toEqual([any.id]);
  });

  it("resolves tag aliases, including with q", async () => {
    const ada = await createUser();
    const p = await createPrompt(ada, { title: "Pull request reviewer", tags: ["pr-review"] });
    const [canon] = await db.insert(tags).values({ slug: "code-review", name: "Code review" }).returning({ id: tags.id });
    await db.update(tags).set({ aliasOfId: canon!.id }).where(eq(tags.slug, "pr-review"));
    expect((await listPrompts({ tag: "code-review", q: "reviewer" })).items.map((i) => i.id)).toEqual([p.id]);
    expect((await listPrompts({ tag: "CODE-REVIEW" })).items.map((i) => i.id)).toEqual([p.id]);
  });
});

describe("listPrompts query safety", () => {
  it("escapes LIKE wildcards in q", async () => {
    const ada = await createUser();
    const pct = await createPrompt(ada, { title: "Get 100% coverage" });
    await createPrompt(ada, { title: "Get coverage" });
    const us = await createPrompt(ada, { title: "snake_case converter" });
    await createPrompt(ada, { title: "snakeXcase converter" });
    expect((await listPrompts({ q: "%" })).items.map((i) => i.id)).toEqual([pct.id]);
    expect((await listPrompts({ q: "100%" })).items.map((i) => i.id)).toEqual([pct.id]);
    expect((await listPrompts({ q: "_" })).items.map((i) => i.id)).toEqual([us.id]);
    expect((await listPrompts({ q: "snake_case" })).items[0]?.id).toBe(us.id);   // literal match first (the near-miss is fuzzy)
    expect((await listPrompts({ q: "\\" })).total).toBe(0);
  });

  it("falls back to trigram/ILIKE for a stopword-only query", async () => {
    const ada = await createUser();
    const hit = await createPrompt(ada, { title: "Think outside the box" });
    await createPrompt(ada, { title: "Weekly agenda" });
    const res = await listPrompts({ q: "the" });
    expect(res.items.map((i) => i.id)).toEqual([hit.id]);
    expect((await listPrompts({ q: "the and of" })).total).toBe(0);
  });

  it("treats SQL metacharacters as data", async () => {
    const ada = await createUser();
    await createPrompt(ada, { title: "Harmless prompt" });
    expect((await listPrompts({ q: "'; DROP TABLE prompts; --" })).total).toBe(0);
    expect((await listPrompts({ q: "\"unbalanced (quote" })).total).toBe(0);
    expect((await db.select({ id: prompts.id }).from(prompts))).toHaveLength(1);
  });
});

describe("listPrompts sorting and paging", () => {
  it("sorts by trending_score, then top, and an explicit sort keeps the q predicate", async () => {
    const ada = await createUser();
    const cold = await createPrompt(ada, { title: "Report writer cold", bayesScore: 5 });
    const hot = await createPrompt(ada, { title: "Report writer hot", bayesScore: 1 });
    const warm = await createPrompt(ada, { title: "Report writer warm", bayesScore: 3 });
    await createPrompt(ada, { title: "Something else", bayesScore: 9 });
    await db.update(prompts).set({ trendingScore: 10 }).where(eq(prompts.id, hot.id));
    await db.update(prompts).set({ trendingScore: 2 }).where(eq(prompts.id, warm.id));
    expect((await listPrompts({ sort: "trending", q: "report" })).items.map((i) => i.id)).toEqual([hot.id, warm.id, cold.id]);
    expect((await listPrompts({ sort: "top", q: "report" })).items.map((i) => i.id)).toEqual([cold.id, warm.id, hot.id]);
    expect((await listPrompts({ sort: "trending" })).items[0]?.title).toBe("Report writer hot");
  });

  it("sorts new by publishedAt with q", async () => {
    const ada = await createUser();
    const old = await createPrompt(ada, { title: "Meeting notes old", publishedAt: new Date("2026-01-01") });
    const fresh = await createPrompt(ada, { title: "Meeting notes fresh", publishedAt: new Date("2026-03-01") });
    expect((await listPrompts({ q: "meeting", sort: "new" })).items.map((i) => i.id)).toEqual([fresh.id, old.id]);
  });

  it("paginates search results with a stable total and clamps pageSize/page", async () => {
    const ada = await createUser();
    for (let i = 0; i < 5; i++) await createPrompt(ada, { title: `Landing page copy ${i}` });
    const p1 = await listPrompts({ q: "landing", pageSize: 2, page: 1 });
    const p3 = await listPrompts({ q: "landing", pageSize: 2, page: 3 });
    expect(p1).toMatchObject({ total: 5, hasMore: true, pageSize: 2 });
    expect(p3).toMatchObject({ total: 5, hasMore: false });
    expect(p3.items).toHaveLength(1);
    const ids = new Set([...p1.items, ...(await listPrompts({ q: "landing", pageSize: 2, page: 2 })).items, ...p3.items].map((i) => i.id));
    expect(ids.size).toBe(5);
    expect(await listPrompts({ q: "landing", pageSize: 2, page: 9 })).toMatchObject({ items: [], total: 5, hasMore: false });
    await expect(listPrompts({ pageSize: 49 })).rejects.toThrow();
    await expect(listPrompts({ page: 51 })).rejects.toThrow();
    await expect(listPrompts({ q: "x".repeat(201) })).rejects.toThrow();
    await expect(listPrompts({ sort: "bogus" as never })).rejects.toThrow();
  });
});
