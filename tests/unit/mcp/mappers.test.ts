import { describe, expect, it } from "vitest";
import { displayName, roundRating, toCategoryResult, toPromptResult, toSearchResult, truncate } from "@/mcp/mappers";
import { parsePromptRef } from "@/mcp/tool-meta";
import { pickOpenModels, buildOpenLinks } from "@/mcp/open-links";
import type { PromptCard, PromptDetail } from "@/lib/types";

const author = { id: "u1", username: "ada", name: "Ada", image: null, isSystem: false };
const card: PromptCard = {
  id: "00000000-0000-4000-8000-000000000001", shortId: "abc1234", slug: "cold-email-abc1234", title: "Cold email",
  description: "desc", category: { slug: "email", name: "Email" }, tags: ["sales"], models: ["chatgpt"], useCase: "generate",
  author, ratingAvg: 4.26, ratingCount: 10, copyCount: 7, saveCount: 2, commentCount: 1, variableCount: 3, isFeatured: false,
  publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
};

describe("toSearchResult", () => {
  it("maps a card to the documented shape without ids, timestamps or authors", () => {
    const r = toSearchResult(card);
    expect(r).toEqual({
      id: "abc1234", title: "Cold email", description: "desc", category: "email", tags: ["sales"], models: ["chatgpt"],
      rating: 4.3, ratingCount: 10, copies: 7, variableCount: 3, url: expect.stringMatching(/\/p\/cold-email-abc1234$/),
    });
    expect(JSON.stringify(r)).not.toMatch(/2026-01|u1|00000000/);
  });

  it("reports an unrated prompt as null", () => {
    expect(toSearchResult({ ...card, ratingAvg: null, ratingCount: 0 }).rating).toBeNull();
    expect(roundRating(null)).toBeNull();
    expect(roundRating(4)).toBe(4);
  });
});

describe("toPromptResult", () => {
  const detail = {
    ...card, body: "Hi {{name}}", variables: [{ key: "name", label: "Name", type: "text", required: true }],
    exampleOutput: "x".repeat(1600), notes: "n", license: "cc_by_4", version: 1, status: "published", openCount: 0,
    workedCount: 0, notWorkedCount: 0, forkCount: 0, testedOn: [], forkedFrom: null, moderationFlags: ["link"],
    moderationNote: "internal", createdAt: "2026-01-01T00:00:00.000Z",
  } as PromptDetail;

  it("truncates example output to 1500 chars and flags it", () => {
    const r = toPromptResult(detail);
    expect(r.exampleOutput).toHaveLength(1500);
    expect(r.exampleOutputTruncated).toBe(true);
    expect(toPromptResult({ ...detail, exampleOutput: "short" })).toMatchObject({ exampleOutput: "short", exampleOutputTruncated: false });
    expect(toPromptResult({ ...detail, exampleOutput: null })).toMatchObject({ exampleOutput: null, exampleOutputTruncated: false });
  });

  it("never leaks moderation data, timestamps or internal ids", () => {
    const text = JSON.stringify(toPromptResult(detail));
    expect(text).not.toMatch(/internal|moderation|createdAt|2026-01|u1|00000000/);
    expect(toPromptResult(detail)).toMatchObject({ id: "abc1234", license: "cc_by_4", author: { name: "Ada", username: "ada" } });
  });

  it("never exposes an email-like display name", () => {
    expect(displayName("ada@example.com", "ada")).toBe("ada");
    expect(displayName("Ada", "ada")).toBe("Ada");
  });
});

describe("helpers", () => {
  it("truncate only cuts over-long text", () => {
    expect(truncate("abc", 5)).toEqual({ text: "abc", truncated: false });
    expect(truncate("abcdef", 4)).toEqual({ text: "abc…", truncated: true });
  });

  it("maps categories", () => {
    expect(toCategoryResult({ id: "x", slug: "a", name: "A", description: "d", icon: "i", promptCount: 3 }))
      .toEqual({ slug: "a", name: "A", description: "d", promptCount: 3 });
  });
});

describe("parsePromptRef", () => {
  it("accepts shortIds, slugs and /p/ URLs", () => {
    expect(parsePromptRef("abc1234")).toBe("abc1234");
    expect(parsePromptRef(" cold-email-opener-abc1234 ")).toBe("abc1234");
    expect(parsePromptRef("https://lazyprompt.ai/p/cold-email-opener-abc1234?ref=x#rate")).toBe("abc1234");
    expect(parsePromptRef("https://lazyprompt.ai/p/cold-email-opener-abc1234/")).toBe("abc1234");
    expect(parsePromptRef("COLD-EMAIL-ABC1234")).toBe("abc1234");
  });

  it("rejects things that are not a prompt reference", () => {
    for (const bad of ["", "   ", "nope", "has space abc1234x", "abc123", "https://", "../../etc/passwd"]) {
      expect(parsePromptRef(bad)).toBeNull();
    }
  });
});

describe("open links", () => {
  it("puts declared models first and caps the list at four", () => {
    expect(pickOpenModels([])).toEqual(["chatgpt", "claude", "gemini", "perplexity"]);
    expect(pickOpenModels(["grok", "claude"])).toEqual(["grok", "claude", "chatgpt", "gemini"]);
    expect(pickOpenModels(["midjourney", "claude"])).toEqual(["claude", "chatgpt", "gemini", "perplexity"]);
  });

  it("prefills where supported and falls back to the base URL for long text and copy-only models", () => {
    const links = buildOpenLinks("hello world", []);
    expect(links.find((l) => l.model === "chatgpt")).toMatchObject({ url: "https://chatgpt.com/?q=hello%20world", prefilled: true });
    expect(links.find((l) => l.model === "gemini")).toMatchObject({ prefilled: false });
    const long = buildOpenLinks("x".repeat(3000), []);
    expect(long.every((l) => !l.prefilled)).toBe(true);
  });
});
