import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";

afterEach(() => vi.unstubAllEnvs());

describe("robots", () => {
  it("disallows private paths and lists the sitemap when indexing is on", () => {
    vi.stubEnv("SEO_NOINDEX", "false");
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules;
    expect(rule.allow).toBe("/");
    expect(rule.disallow).toEqual(["/admin", "/api", "/me", "/settings", "/submit", "/oauth", "/mcp"]);
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("disallows everything with SEO_NOINDEX=true", () => {
    vi.stubEnv("SEO_NOINDEX", "true");
    const rule = Array.isArray(robots().rules) ? (robots().rules as unknown[])[0] : robots().rules;
    expect(rule).toMatchObject({ disallow: "/" });
  });
});
