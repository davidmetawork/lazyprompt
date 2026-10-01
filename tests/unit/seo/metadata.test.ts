import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMetadata, formatTitle } from "@/lib/seo/metadata";

afterEach(() => vi.unstubAllEnvs());

describe("buildMetadata", () => {
  it("strips the query from the canonical URL and makes it absolute", () => {
    const m = buildMetadata({ title: "Prompts", description: "d", path: "/prompts?q=x&page=2" });
    expect(m.alternates?.canonical).toMatch(/^https?:\/\/.+\/prompts$/);
  });

  it("applies the title template and truncates to 60 chars at a word boundary", () => {
    expect(formatTitle("About")).toBe("About | LazyPrompt");
    const long = formatTitle("Write a thoroughly detailed cold outreach email sequence for enterprise software buyers");
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith(" | LazyPrompt")).toBe(true);
    expect(long).toContain("…");
    expect(long).not.toMatch(/\s…/);
  });

  it("limits the description to 160 chars", () => {
    const m = buildMetadata({ title: "t", description: "word ".repeat(100), path: "/" });
    expect((m.description ?? "").length).toBeLessThanOrEqual(160);
  });

  it("defaults og type to website and supports article", () => {
    expect((buildMetadata({ title: "t", description: "d", path: "/" }).openGraph as { type: string }).type).toBe("website");
    expect((buildMetadata({ title: "t", description: "d", path: "/p/x", type: "article" }).openGraph as { type: string }).type).toBe("article");
    expect(buildMetadata({ title: "t", description: "d", path: "/" }).twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("emits noindex,follow for the noindex arg and for SEO_NOINDEX=true", () => {
    vi.stubEnv("SEO_NOINDEX", "false");
    expect(buildMetadata({ title: "t", description: "d", path: "/" }).robots).toBeUndefined();
    expect(buildMetadata({ title: "t", description: "d", path: "/", noindex: true }).robots).toEqual({ index: false, follow: true });
    vi.stubEnv("SEO_NOINDEX", "true");
    expect(buildMetadata({ title: "t", description: "d", path: "/" }).robots).toEqual({ index: false, follow: true });
  });

  it("uses an explicit ogImage when given", () => {
    const m = buildMetadata({ title: "t", description: "d", path: "/", ogImage: "https://x.test/a.png" });
    expect(m.openGraph?.images).toEqual([{ url: "https://x.test/a.png" }]);
  });
});
