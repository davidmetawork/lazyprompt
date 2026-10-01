import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ db: { execute } }));

const getPromptByShortId = vi.hoisted(() => vi.fn());
vi.mock("@/server/prompts/queries", () => ({ getPromptByShortId }));
vi.mock("@/lib/seo/og", () => ({
  OG_SIZE: { width: 1200, height: 630 }, loadOgFonts: async () => [], BrandCard: () => null, PromptCard: () => null,
}));
vi.mock("next/og", () => ({ ImageResponse: class { constructor(public node: unknown) {} } }));

beforeEach(() => { vi.resetAllMocks(); });

describe("GET /api/health", () => {
  it("returns 200 ok:true when the database answers", async () => {
    execute.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 ok:false (not 200) when the database check throws, and logs only the error name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    execute.mockRejectedValue(Object.assign(new Error("password authentication failed for user secret"), { name: "DatabaseError" }));
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, db: false });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(spy).toHaveBeenCalledWith("[health] db check failed", "DatabaseError");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    spy.mockRestore();
  });
});

describe("prompt opengraph-image", () => {
  const call = async (slug: string) => {
    const { default: Image } = await import("@/app/(site)/p/[slug]/opengraph-image");
    return Image({ params: Promise.resolve({ slug }) });
  };

  it("404s for unknown, unpublished or removed prompts instead of serving a 200 brand card", async () => {
    getPromptByShortId.mockResolvedValue(null);
    await expect(call("missing-prompt-abcd123")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
    await expect(call("not a slug")).rejects.toMatchObject({ digest: expect.stringContaining("404") });
  });

  it("serves the brand card when the database errors (a broken image would be worse)", async () => {
    getPromptByShortId.mockRejectedValue(new Error("db down"));
    const res = await call("some-prompt-abcd123");
    expect(res).toBeDefined();
  });

  it("renders the prompt card for a published prompt", async () => {
    getPromptByShortId.mockResolvedValue({ title: "T", category: { name: "C" }, ratingAvg: 4, ratingCount: 2 });
    expect(await call("some-prompt-abcd123")).toBeDefined();
  });
});
