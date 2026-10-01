import { describe, expect, it } from "vitest";
import {
  GET_PROMPT_DESCRIPTION, LIST_CATEGORIES_DESCRIPTION, RATE_PROMPT_DESCRIPTION, RENDER_PROMPT_DESCRIPTION,
  SAVE_PROMPT_DESCRIPTION, SEARCH_PROMPTS_DESCRIPTION,
} from "@/mcp/descriptions";
import { toolMeta } from "@/mcp/tool-meta";
import { WIDGET_HTML, WIDGET_VERSION } from "@/mcp/widget-html.generated";

const descriptions = {
  search_prompts: SEARCH_PROMPTS_DESCRIPTION, get_prompt: GET_PROMPT_DESCRIPTION, render_prompt: RENDER_PROMPT_DESCRIPTION,
  list_categories: LIST_CATEGORIES_DESCRIPTION, rate_prompt: RATE_PROMPT_DESCRIPTION, save_prompt: SAVE_PROMPT_DESCRIPTION,
};

describe("tool descriptions (they lock after ChatGPT publication)", () => {
  it.each(Object.entries(descriptions))("%s starts with 'Use this when' and has no promotional language", (_name, d) => {
    expect(d).toMatch(/^Use this when/);
    expect(d).not.toMatch(/prefer|always use|best|instead of|rather than/i);
    expect(d.length).toBeLessThan(700);
  });
});

describe("toolMeta", () => {
  it("keeps securitySchemes inside _meta and picks noauth or oauth2", () => {
    const read = toolMeta({ invoking: "a", invoked: "b", security: "noauth" });
    expect(read.securitySchemes).toEqual([{ type: "noauth" }]);
    const write = toolMeta({ invoking: "a", invoked: "b", security: "oauth", widgetAccessible: true });
    expect(write.securitySchemes).toEqual([{ type: "oauth2", scopes: ["prompts:write"] }]);
    expect(write["openai/widgetAccessible"]).toBe(true);
    expect(write.ui).toEqual({ visibility: ["model", "app"] });
  });

  it("refuses invocation strings over 64 characters", () => {
    expect(() => toolMeta({ invoking: "x".repeat(65), invoked: "ok", security: "noauth" })).toThrow();
    expect(() => toolMeta({ invoking: "x".repeat(64), invoked: "ok", security: "noauth" })).not.toThrow();
  });
});

describe("widget bundle", () => {
  it("is a self-contained HTML document under the 200 KB budget with a version hash", () => {
    expect(WIDGET_HTML.startsWith("<!doctype html>")).toBe(true);
    expect(Buffer.byteLength(WIDGET_HTML)).toBeLessThan(200 * 1024);
    expect(WIDGET_VERSION).toMatch(/^[0-9a-f]{8}$/);
    expect(WIDGET_HTML).not.toMatch(/<script[^>]+src=/i);
    expect(WIDGET_HTML).not.toMatch(/<link[^>]+href=["']https?:/i);
  });
});
