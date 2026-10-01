import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({ listPrompts: vi.fn(), listSitemapEntries: vi.fn() }));
const taxonomy = vi.hoisted(() => ({ listCategories: vi.fn(), listTagsForSitemap: vi.fn() }));
vi.mock("@/server/prompts/queries", () => queries);
vi.mock("@/server/taxonomy", () => taxonomy);

import { GET as feedGet } from "@/app/feed.xml/route";
import { GET as llmsGet } from "@/app/llms.txt/route";
import sitemap from "@/app/sitemap";
import { buildRss, escapeXml } from "@/lib/seo/rss";

beforeEach(() => { vi.resetAllMocks(); });

describe("RSS", () => {
  it("escapes XML special characters and strips illegal control chars", () => {
    expect(escapeXml(`a & b < c > "d" 'e'\u0001`)).toBe("a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;");
    const xml = buildRss([{ title: "<script>&", slug: "x-abc1234", description: "5 > 3", category: "A&B", publishedAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }]);
    expect(xml).toContain("<title>&lt;script&gt;&amp;</title>");
    expect(xml).toContain("<category>A&amp;B</category>");
    expect(xml).not.toContain("<script>");
    expect(xml).toMatch(/<guid isPermaLink="true">https?:\/\/.+\/p\/x-abc1234<\/guid>/);
  });
});

describe("degradation when the server calls throw", () => {
  it("feed rethrows database errors at runtime so the last good ISR copy keeps being served", async () => {
    queries.listPrompts.mockRejectedValue(new Error("db down"));
    await expect(feedGet()).rejects.toThrow("db down");
  });

  it("llms.txt rethrows database errors at runtime", async () => {
    taxonomy.listCategories.mockRejectedValue(new Error("db down"));
    await expect(llmsGet()).rejects.toThrow("db down");
  });

  it("feed returns an empty valid channel when the production build has no database", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    queries.listPrompts.mockRejectedValue(new Error("db down"));
    const res = await feedGet();
    vi.unstubAllEnvs();
    expect(res.headers.get("content-type")).toContain("application/rss+xml");
    const xml = await res.text();
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });

  it("sitemap rethrows database errors at runtime so the last good ISR copy keeps being served", async () => {
    queries.listSitemapEntries.mockRejectedValue(new Error("nope"));
    taxonomy.listCategories.mockResolvedValue([]);
    taxonomy.listTagsForSitemap.mockResolvedValue([]);
    await expect(sitemap()).rejects.toThrow("nope");
  });

  it("sitemap returns the static pages when the production build has no database", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    queries.listSitemapEntries.mockRejectedValue(new Error("nope"));
    taxonomy.listCategories.mockRejectedValue(new Error("nope"));
    taxonomy.listTagsForSitemap.mockRejectedValue(new Error("nope"));
    const entries = await sitemap();
    vi.unstubAllEnvs();
    const urls = entries.map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/prompts"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/privacy"))).toBe(true);
    expect(urls.some((u) => u.includes("/p/"))).toBe(false);
  });

  it("sitemap lists prompts, categories and only tags with >= 5 prompts", async () => {
    queries.listSitemapEntries.mockResolvedValue([{ slug: "hello-abc1234", updatedAt: "2026-01-02T00:00:00Z" }]);
    taxonomy.listCategories.mockResolvedValue([{ slug: "coding" }]);
    taxonomy.listTagsForSitemap.mockResolvedValue([{ slug: "big", promptCount: 5 }, { slug: "small", promptCount: 4 }]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/p/hello-abc1234"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/c/coding"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/t/big"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/t/small"))).toBe(false);
  });

  it("llms.txt falls back to the static category list and links /apps when the production build has no database", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    taxonomy.listCategories.mockRejectedValue(new Error("nope"));
    const text = await (await llmsGet()).text();
    vi.unstubAllEnvs();
    expect(text).toContain("/c/coding");
    expect(text).toMatch(/\/apps/);
  });
});
