import { describe, expect, it } from "vitest";
import { buildPromptSlug, generateUsername, newShortId, normalizeTag, parseShortIdFromSlug, slugify } from "@/lib/slug";

describe("slugify", () => {
  it("kebab-cases and strips diacritics and symbols", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("Crème Brûlée & Co")).toBe("creme-brulee-and-co");
    expect(slugify("  --weird__input--  ")).toBe("weird-input");
  });
  it("truncates without a trailing dash", () => {
    const s = slugify("a ".repeat(100), 10);
    expect(s.length).toBeLessThanOrEqual(10);
    expect(s.endsWith("-")).toBe(false);
  });
  it("returns empty for non-latin input", () => {
    expect(slugify("日本語")).toBe("");
  });
});

describe("short ids and prompt slugs", () => {
  it("newShortId is 7 base36 chars", () => {
    for (let i = 0; i < 50; i++) expect(newShortId()).toMatch(/^[0-9a-z]{7}$/);
  });
  it("buildPromptSlug appends the shortId", () => {
    expect(buildPromptSlug("Write a Cold Email", "abc1234")).toBe("write-a-cold-email-abc1234");
    expect(buildPromptSlug("日本語", "abc1234")).toBe("abc1234");
  });
  it("buildPromptSlug caps the title part at 60 chars", () => {
    const slug = buildPromptSlug("x".repeat(200), "abc1234");
    expect(slug).toBe(`${"x".repeat(60)}-abc1234`);
  });
  it("parseShortIdFromSlug round-trips and rejects junk", () => {
    expect(parseShortIdFromSlug("write-a-cold-email-abc1234")).toBe("abc1234");
    expect(parseShortIdFromSlug("abc1234")).toBe("abc1234");
    expect(parseShortIdFromSlug("no-short-id-here")).toBeNull();
    expect(parseShortIdFromSlug("title-ABC1234")).toBeNull();
    expect(parseShortIdFromSlug("title-abc12345")).toBeNull();
  });
});

describe("normalizeTag", () => {
  it("normalizes", () => {
    expect(normalizeTag("Code Review")).toBe("code-review");
    expect(normalizeTag("  SEO!! ")).toBe("seo");
    expect(normalizeTag("a--b")).toBe("a-b");
  });
  it("rejects too short or empty", () => {
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("!!!")).toBeNull();
  });
  it("caps at 32 chars", () => {
    expect(normalizeTag("x".repeat(80))?.length).toBe(32);
  });
});

describe("generateUsername", () => {
  it("matches the profile username regex", () => {
    for (const seed of ["Ada Lovelace", "x", "日本語", "me@example.com", "A".repeat(80), "---"]) {
      expect(generateUsername(seed)).toMatch(/^[a-z0-9][a-z0-9_-]{2,29}$/);
    }
  });
  it("adds randomness", () => {
    expect(new Set(Array.from({ length: 20 }, () => generateUsername("sam"))).size).toBeGreaterThan(15);
  });
});
