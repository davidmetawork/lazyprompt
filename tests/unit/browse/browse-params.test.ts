import { describe, expect, it } from "vitest";
import { buildBrowseHref, effectiveSort, hasIndexBlockingFilters, parseBrowseParams } from "@/components/prompt/browse-params";
import { promptPageTitle } from "@/components/prompt/labels";

describe("parseBrowseParams", () => {
  it("reads valid params and maps use to useCase", () => {
    const { state, input } = parseBrowseParams({ q: " email ", category: "writing", model: "claude", use: "rewrite", sort: "new", page: "2" });
    expect(state).toMatchObject({ q: "email", category: "writing", model: "claude", use: "rewrite", sort: "new", page: 2 });
    expect(input).toMatchObject({ q: "email", useCase: "rewrite", page: 2 });
  });

  it("drops invalid fields individually instead of throwing", () => {
    const { state } = parseBrowseParams({ q: "ok", model: "skynet", use: "nope", sort: "random", page: "999" });
    expect(state.q).toBe("ok");
    expect(state.model).toBeUndefined();
    expect(state.use).toBeUndefined();
    expect(state.sort).toBeUndefined();
    expect(state.page).toBe(1);
  });

  it("caps q at 200 characters by dropping it", () => {
    expect(parseBrowseParams({ q: "x".repeat(201) }).state.q).toBeUndefined();
  });

  it("takes the first value of repeated params", () => {
    expect(parseBrowseParams({ category: ["a", "b"] }).state.category).toBe("a");
  });
});

describe("effectiveSort", () => {
  it("defaults to relevance with q and top without", () => {
    expect(effectiveSort({ q: "a" })).toBe("relevance");
    expect(effectiveSort({})).toBe("top");
    expect(effectiveSort({ q: "a", sort: "new" })).toBe("new");
  });
});

describe("buildBrowseHref", () => {
  it("omits empty values, page 1 and fixed keys, and applies patches", () => {
    expect(buildBrowseHref("/prompts", { q: "a b", category: "writing", page: 3 })).toBe("/prompts?q=a+b&category=writing&page=3");
    expect(buildBrowseHref("/prompts", { q: "a", page: 3 }, { page: null, q: null })).toBe("/prompts");
    expect(buildBrowseHref("/c/writing", { category: "writing", model: "claude" }, {}, ["category"])).toBe("/c/writing?model=claude");
  });
});

describe("hasIndexBlockingFilters", () => {
  it("allows no filters or a bare q, blocks everything else", () => {
    expect(hasIndexBlockingFilters({ page: 1 })).toBe(false);
    expect(hasIndexBlockingFilters({ page: 1, q: "email" })).toBe(false);
    expect(hasIndexBlockingFilters({ page: 1, q: "email", model: "claude" })).toBe(true);
    expect(hasIndexBlockingFilters({ page: 1, sort: "new" })).toBe(true);
  });
});

describe("promptPageTitle", () => {
  it("keeps the visible title within 60 characters including the site suffix", () => {
    expect(promptPageTitle("Short title")).toBe("Short title – AI prompt");
    const long = promptPageTitle("A very long prompt title that keeps going and going and going");
    expect(`${long} | LazyPrompt`.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("… – AI prompt")).toBe(true);
  });
});
