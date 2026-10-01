import { describe, expect, it } from "vitest";
import {
  commentInputSchema, listPromptsInputSchema, profileInputSchema, promptInputSchema, promptUpdateInputSchema,
  ratingInputSchema, reportInputSchema, safeNext, usageEventInputSchema, variableDefSchema,
} from "@/lib/validation";

describe("safeNext", () => {
  it.each([
    ["/submit", "/submit"],
    ["/p/abc?x=1#y", "/p/abc?x=1#y"],
    ["/", "/"],
  ])("accepts %s", (raw, out) => expect(safeNext(raw)).toBe(out));

  it.each([
    "/\t/evil.com", "/\n/x", "/\r/x", "/ /evil.com", "/\u0000/x", "/\u007f/x", "//evil.com",
    "//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "", "evil", "\\\\evil",
    "/.//evil.com", "/..//evil.com", "/a/..//evil.com", "/%2e%2e//evil.com", "/././/evil.com", "/a/../..//evil.com",
  ])("rejects %j", (raw) => expect(safeNext(raw)).toBe("/"));

  it("keeps percent-encoded controls same-origin and normalises via URL", () => {
    expect(safeNext("/%09/x")).toBe("/%09/x");
    expect(safeNext("/p/foo?x=1#rate")).toBe("/p/foo?x=1#rate");
  });

  it("never returns a protocol-relative path after normalisation", () => {
    for (const raw of ["/.//evil.com", "/..//evil.com", "/a/..//evil.com", "/%2e%2e//evil.com", "/%2E/%2e//x"]) {
      expect(safeNext(raw).startsWith("//")).toBe(false);
    }
    expect(safeNext("/a/../b")).toBe("/b");
  });

  it("rejects null, undefined and over-long values", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext(`/${"a".repeat(512)}`)).toBe("/");
    expect(safeNext(`/${"a".repeat(511)}`)).toHaveLength(512);
  });
});

const validPrompt = {
  title: "A valid prompt title",
  description: "A description that is comfortably longer than twenty characters.",
  body: "Write something helpful about {{topic}} for the reader, in a friendly tone.",
  categorySlug: "writing",
  useCase: "generate",
  tags: ["Email", "tone"],
} as const;

describe("promptInputSchema", () => {
  it("applies defaults and normalizes tags", () => {
    const r = promptInputSchema.parse(validPrompt);
    expect(r.tags).toEqual(["email", "tone"]);
    expect(r.variables).toEqual([]);
    expect(r.models).toEqual([]);
    expect(r.license).toBe("cc_by_4");
  });
  it("enforces limits", () => {
    expect(promptInputSchema.safeParse({ ...validPrompt, title: "short" }).success).toBe(false);
    expect(promptInputSchema.safeParse({ ...validPrompt, body: "too short" }).success).toBe(false);
    expect(promptInputSchema.safeParse({ ...validPrompt, tags: [] }).success).toBe(false);
    expect(promptInputSchema.safeParse({ ...validPrompt, tags: ["a1", "b2", "c3", "d4", "e5", "f6"] }).success).toBe(false);
    expect(promptInputSchema.safeParse({ ...validPrompt, tags: ["!"] }).success).toBe(false);
    expect(promptInputSchema.safeParse({ ...validPrompt, models: ["chatgpt", "nope"] }).success).toBe(false);
  });
  it("update schema drops forkedFromShortId and allows changeNote", () => {
    const r = promptUpdateInputSchema.parse({ ...validPrompt, changeNote: "typo", forkedFromShortId: "abc1234" });
    expect(r.changeNote).toBe("typo");
    expect("forkedFromShortId" in r).toBe(false);
  });
});

describe("variableDefSchema", () => {
  it.each(["constructor", "prototype", "__proto__", "toString", "valueOf", "hasOwnProperty",
    "isPrototypeOf", "propertyIsEnumerable", "toLocaleString"])("rejects reserved key %s", (key) => {
    expect(variableDefSchema.safeParse({ key, label: "A", type: "text", required: false }).success).toBe(false);
  });

  it("requires options for select", () => {
    expect(variableDefSchema.safeParse({ key: "a", label: "A", type: "select", required: true }).success).toBe(false);
    expect(variableDefSchema.safeParse({ key: "a", label: "A", type: "select", options: ["x", "y"], required: true }).success).toBe(true);
  });
  it("validates keys", () => {
    expect(variableDefSchema.safeParse({ key: "9a", label: "A", type: "text", required: true }).success).toBe(false);
  });
});

describe("other schemas", () => {
  it("listPromptsInputSchema coerces and caps", () => {
    const r = listPromptsInputSchema.parse({ q: "  hi ", page: "2", pageSize: "48" });
    expect(r).toMatchObject({ q: "hi", page: 2, pageSize: 48 });
    expect(listPromptsInputSchema.parse({})).toMatchObject({ page: 1, pageSize: 24 });
    expect(listPromptsInputSchema.safeParse({ page: 51 }).success).toBe(false);
    expect(listPromptsInputSchema.safeParse({ pageSize: 49 }).success).toBe(false);
    expect(listPromptsInputSchema.safeParse({ q: "x".repeat(201) }).success).toBe(false);
    expect(listPromptsInputSchema.safeParse({ sort: "bogus" }).success).toBe(false);
  });
  it("commentInputSchema trims and bounds", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(commentInputSchema.parse({ promptId: id, body: "  hello " }).body).toBe("hello");
    expect(commentInputSchema.safeParse({ promptId: id, body: "   " }).success).toBe(false);
    expect(commentInputSchema.safeParse({ promptId: "nope", body: "x" }).success).toBe(false);
  });
  it("ratingInputSchema accepts 1-5 integers", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const stars of [1, 5]) expect(ratingInputSchema.safeParse({ promptId: id, stars }).success).toBe(true);
    for (const stars of [0, 6, 2.5]) expect(ratingInputSchema.safeParse({ promptId: id, stars }).success).toBe(false);
  });
  it("reportInputSchema validates enums", () => {
    expect(reportInputSchema.safeParse({ targetType: "prompt", targetId: "x", reason: "spam" }).success).toBe(true);
    expect(reportInputSchema.safeParse({ targetType: "prompt", targetId: "x", reason: "bogus" }).success).toBe(false);
  });
  it("profileInputSchema validates username and https website", () => {
    expect(profileInputSchema.safeParse({ username: "good_name-1" }).success).toBe(true);
    expect(profileInputSchema.safeParse({ username: "Bad Name" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ username: "ab" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ username: "okname", website: "https://example.com" }).success).toBe(true);
    expect(profileInputSchema.safeParse({ username: "okname", website: "http://example.com" }).success).toBe(false);
    expect(profileInputSchema.safeParse({ username: "okname", website: "javascript:alert(1)" }).success).toBe(false);
    expect(profileInputSchema.parse({ username: "okname", website: "" }).website).toBeUndefined();
  });
  it("usageEventInputSchema validates type", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(usageEventInputSchema.safeParse({ promptId: id, type: "copy" }).success).toBe(true);
    expect(usageEventInputSchema.safeParse({ promptId: id, type: "nope" }).success).toBe(false);
  });
});
