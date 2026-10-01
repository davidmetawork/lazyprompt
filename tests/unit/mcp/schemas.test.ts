import { describe, expect, it } from "vitest";
import {
  getPromptInput, listCategoriesInput, ratePromptInput, renderPromptInput, savePromptInput, searchPromptsInput,
} from "@/mcp/schemas";

describe("search_prompts input", () => {
  it("accepts an empty call and applies the default limit", () => {
    expect(searchPromptsInput.parse({})).toEqual({ limit: 5 });
  });

  it("trims the query and validates every field", () => {
    expect(searchPromptsInput.parse({ query: "  cold email ", model: "claude", sort: "top", category: "email-writing", limit: 10 }))
      .toEqual({ query: "cold email", model: "claude", sort: "top", category: "email-writing", limit: 10 });
  });

  it.each([
    [{ query: "" }], [{ query: "   " }], [{ query: "x".repeat(201) }],
    [{ limit: 0 }], [{ limit: 11 }], [{ limit: 2.5 }], [{ limit: "5" }],
    [{ model: "gpt-9" }], [{ sort: "popular" }], [{ category: "Not A Slug" }], [{ category: "../x" }],
  ])("rejects %j", (input) => {
    expect(searchPromptsInput.safeParse(input).success).toBe(false);
  });
});

describe("get_prompt / save_prompt input", () => {
  it("requires a non-empty id of at most 200 chars", () => {
    expect(getPromptInput.parse({ id: " abc1234 " })).toEqual({ id: "abc1234" });
    expect(savePromptInput.safeParse({ id: "abc1234" }).success).toBe(true);
    for (const bad of [{}, { id: "" }, { id: "   " }, { id: "x".repeat(201) }, { id: 5 }]) {
      expect(getPromptInput.safeParse(bad).success).toBe(false);
      expect(savePromptInput.safeParse(bad).success).toBe(false);
    }
  });
});

describe("render_prompt input", () => {
  it("accepts up to 20 values of up to 4000 chars", () => {
    const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, "v"]));
    expect(renderPromptInput.safeParse({ id: "abc1234", values: twenty }).success).toBe(true);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: { a: "x".repeat(4000) } }).success).toBe(true);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: {} }).success).toBe(true);
  });

  it("treats an omitted values map as empty (a prompt without variables needs no values)", () => {
    const parsed = renderPromptInput.safeParse({ id: "abc1234" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.values).toEqual({});
  });

  it("rejects too many values, oversized values, non-string values and a null values map", () => {
    const twentyOne = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));
    expect(renderPromptInput.safeParse({ id: "abc1234", values: twentyOne }).success).toBe(false);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: { a: "x".repeat(4001) } }).success).toBe(false);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: { a: 5 } }).success).toBe(false);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: { "": "x" } }).success).toBe(false);
    expect(renderPromptInput.safeParse({ id: "abc1234", values: null }).success).toBe(false);
  });
});

describe("rate_prompt input", () => {
  it("accepts integer stars 1-5 only", () => {
    for (const stars of [1, 2, 3, 4, 5]) expect(ratePromptInput.safeParse({ id: "abc1234", stars }).success).toBe(true);
    for (const stars of [0, 6, 4.5, -1, "5", null]) expect(ratePromptInput.safeParse({ id: "abc1234", stars }).success).toBe(false);
  });
});

describe("list_categories input", () => {
  it("takes no arguments", () => {
    expect(listCategoriesInput.safeParse({}).success).toBe(true);
  });
});
