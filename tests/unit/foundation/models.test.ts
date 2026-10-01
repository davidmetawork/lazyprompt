import { describe, expect, it } from "vitest";
import { AI_MODELS } from "@/lib/constants";
import { MAX_DEEP_LINK_LENGTH, MODEL_TARGETS, OPEN_TARGETS, buildOpenLink } from "@/lib/models";

describe("model targets", () => {
  it("has an entry for every AI model", () => {
    for (const m of AI_MODELS) expect(MODEL_TARGETS[m].id).toBe(m);
  });
  it("OPEN_TARGETS are the eight chat models", () => {
    expect(OPEN_TARGETS).toEqual(["chatgpt", "claude", "gemini", "perplexity", "grok", "copilot", "mistral", "deepseek"]);
  });
});

describe("buildOpenLink", () => {
  it("prefills ChatGPT with an encoded query", () => {
    const r = buildOpenLink("chatgpt", "Hello & welcome?");
    expect(r).toEqual({ url: "https://chatgpt.com/?q=Hello%20%26%20welcome%3F", prefilled: true });
  });
  it("prefills Claude, Grok and Perplexity", () => {
    expect(buildOpenLink("claude", "x")?.url).toBe("https://claude.ai/new?q=x");
    expect(buildOpenLink("grok", "x")?.url).toBe("https://grok.com/?q=x");
    const p = buildOpenLink("perplexity", "x");
    expect(p?.url).toBe("https://www.perplexity.ai/search?q=x");
    expect(p?.warning).toMatch(/immediately/i);
  });
  it("copy-only models return the base URL without prefill", () => {
    for (const m of ["gemini", "copilot", "mistral", "deepseek"] as const) {
      const r = buildOpenLink(m, "anything");
      expect(r?.prefilled).toBe(false);
      expect(r?.url).toBe(MODEL_TARGETS[m].baseUrl);
    }
  });
  it("falls back to the base URL when the full URL is too long", () => {
    const r = buildOpenLink("chatgpt", "a".repeat(MAX_DEEP_LINK_LENGTH));
    expect(r?.prefilled).toBe(false);
    expect(r?.url).toBe("https://chatgpt.com/");
  });
  it("keeps a URL exactly at the limit prefilled", () => {
    const base = "https://chatgpt.com/?q=".length;
    const r = buildOpenLink("chatgpt", "a".repeat(MAX_DEEP_LINK_LENGTH - base));
    expect(r?.prefilled).toBe(true);
    expect(r?.url.length).toBe(MAX_DEEP_LINK_LENGTH);
  });
  it("returns null for image and video models", () => {
    for (const m of ["midjourney", "stable_diffusion", "flux", "sora", "veo", "llama"] as const) {
      expect(buildOpenLink(m, "x")).toBeNull();
    }
  });
});
