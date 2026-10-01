import { describe, expect, it } from "vitest";
import { asStringMap, interpretResult, needsSignIn, ratingLabel, siteFallbackUrl, siteOrigin, textOf } from "../../../widget/src/model";

const prompt = { id: "abc1234", title: "T", variables: [], body: "b", url: "https://lazyprompt.ai/p/t-abc1234" };

describe("interpretResult", () => {
  it("search results become a list view", () => {
    const out = interpretResult({ structuredContent: { query: "email", total: 9, results: [{ id: "a" }, { id: "b" }] } }, undefined);
    expect(out).toMatchObject({ kind: "view", view: { kind: "list", list: { query: "email", total: 9 } } });
    if (out.kind === "view" && out.view.kind === "list") expect(out.view.list.results).toHaveLength(2);
  });

  it("a null query and missing total are tolerated", () => {
    const out = interpretResult({ structuredContent: { query: null, results: [{ id: "a" }] } }, undefined);
    expect(out).toMatchObject({ kind: "view", view: { kind: "list", list: { query: null, total: 1 } } });
  });

  it("get_prompt becomes a card", () => {
    expect(interpretResult({ structuredContent: { prompt } }, { id: "abc1234" })).toMatchObject({
      kind: "view", view: { kind: "card", initialValues: {}, back: null },
    });
  });

  it("render_prompt asks to load the prompt and carries the call's values", () => {
    const out = interpretResult({ structuredContent: { id: "abc1234", text: "Hi Dana", missing: [], complete: true, openLinks: [] } }, { id: "abc1234", values: { name: "Dana", n: 5 } });
    expect(out).toEqual({ kind: "open-prompt", id: "abc1234", initialValues: { name: "Dana" } });
  });

  it("errors and unknown shapes become messages", () => {
    expect(interpretResult({ isError: true, content: [{ type: "text", text: "No published prompt matches" }] }, undefined))
      .toEqual({ kind: "view", view: { kind: "message", text: "No published prompt matches", tone: "error" } });
    expect(interpretResult({ isError: true }, undefined)).toMatchObject({ view: { text: "Something went wrong." } });
    expect(interpretResult({ content: [{ type: "text", text: "5 categories" }], structuredContent: { categories: [] } }, undefined))
      .toEqual({ kind: "view", view: { kind: "message", text: "5 categories", tone: "info" } });
    expect(interpretResult({}, undefined)).toMatchObject({ view: { kind: "message", text: "Nothing to show." } });
  });
});

describe("helpers", () => {
  it("joins text content", () => {
    expect(textOf({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] })).toBe("a\nb");
  });

  it("asStringMap keeps only string values", () => {
    expect(asStringMap({ a: "x", b: 1, c: null })).toEqual({ a: "x" });
    expect(asStringMap(null)).toEqual({});
    expect(asStringMap([1])).toEqual({});
  });

  it("describes ratings for screen readers", () => {
    expect(ratingLabel(null, 0)).toBe("Not rated yet");
    expect(ratingLabel(4.5, 1)).toBe("Rated 4.5 out of 5 by 1 person");
    expect(ratingLabel(4.5, 12)).toBe("Rated 4.5 out of 5 by 12 people");
  });

  it("builds site fallbacks and detects the sign-in challenge", () => {
    expect(siteFallbackUrl("https://x.test/p/a-1234567", "rate")).toBe("https://x.test/p/a-1234567#rate");
    expect(siteFallbackUrl("https://x.test/p/a-1234567", "save")).toBe("https://x.test/p/a-1234567");
    expect(siteOrigin("https://x.test/p/a")).toBe("https://x.test");
    expect(siteOrigin("nope")).toBeNull();
    expect(needsSignIn({ isError: true, _meta: { "mcp/www_authenticate": ["Bearer ..."] } })).toBe(true);
    expect(needsSignIn({ isError: true, _meta: {} })).toBe(false);
    expect(needsSignIn({ _meta: { "mcp/www_authenticate": ["x"] } })).toBe(false);
  });
});
