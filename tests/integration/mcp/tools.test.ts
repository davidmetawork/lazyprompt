import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db";
import { absoluteUrl } from "@/lib/base-url";
import { WIDGET_HTML, WIDGET_VERSION } from "@/mcp/widget-html.generated";
import { createCategory, createPrompt, createUser } from "../../helpers/factories";
import { resetDb } from "../../helpers/db";
import { callTool, initialize, rpc, setMcpEnv, unsetMcpEnv } from "./helpers";

afterAll(async () => { await closeDb(); });

let shortId: string;
let slug: string;

beforeAll(async () => {
  await resetDb();
  const author = await createUser({ trustLevel: 2, name: "Ada Author" });
  const cat = await createCategory({ slug: "email-writing", name: "Email writing" });
  const p = await createPrompt(author, {
    title: "Cold email opener",
    categorySlug: cat.slug,
    description: "Write a short, friendly cold email opener that gets replies from busy people.",
    body: "Write a cold email to {{recipient}} about {{offer|our new product}}.",
    variables: [
      { key: "recipient", label: "Recipient", type: "text", required: true },
      { key: "offer", label: "Offer", type: "text", required: false, default: "our new product" },
    ],
    tags: ["email", "sales"],
    models: ["chatgpt", "claude"],
    exampleOutput: "x".repeat(2000),
    ratingCount: 4,
    ratingSum: 18,
  });
  shortId = p.shortId;
  slug = p.slug;
  await createPrompt(author, { title: "Hidden one", status: "pending", categorySlug: cat.slug });
});

beforeEach(() => { unsetMcpEnv(); });
afterEach(() => { unsetMcpEnv(); });

describe("initialize and listing (flag off)", () => {
  it("initializes and advertises tools and resources", async () => {
    const res = await initialize();
    expect(res.status).toBe(200);
    expect(res.json?.result).toMatchObject({ serverInfo: { name: "lazyprompt" } });
    expect(res.json?.result?.capabilities).toMatchObject({ tools: expect.anything(), resources: expect.anything() });
  });

  it("lists exactly the four read tools with annotations and meta", async () => {
    const res = await rpc("tools/list");
    const tools = (res.json?.result?.tools ?? []) as { name: string; annotations: Record<string, boolean>; _meta: Record<string, unknown>; inputSchema: unknown; description: string }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["get_prompt", "list_categories", "render_prompt", "search_prompts"]);
    for (const t of tools) {
      expect(t.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true });
      expect(t._meta.securitySchemes).toEqual([{ type: "noauth" }]);
      expect(t).not.toHaveProperty("securitySchemes");
      expect(String(t._meta["openai/toolInvocation/invoking"]).length).toBeLessThanOrEqual(64);
      expect(String(t._meta["openai/toolInvocation/invoked"]).length).toBeLessThanOrEqual(64);
      expect(t.description).not.toMatch(/prefer/i);
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    const uri = `ui://lazyprompt/prompt-widget.html?v=${WIDGET_VERSION}`;
    expect((byName.search_prompts!._meta.ui as { resourceUri: string }).resourceUri).toBe(uri);
    for (const n of ["get_prompt", "render_prompt"]) {
      expect(byName[n]!._meta["openai/widgetAccessible"]).toBe(true);
      expect(byName[n]!._meta.ui).toEqual({ resourceUri: uri, visibility: ["model", "app"] });
    }
    expect(byName.search_prompts!._meta["openai/widgetAccessible"]).toBeUndefined();
    expect(byName.list_categories!._meta.ui).toBeUndefined();
  });

  it("reads the widget resource as text/html;profile=mcp-app", async () => {
    const list = await rpc("resources/list");
    const resources = (list.json?.result?.resources ?? []) as { uri: string }[];
    expect(resources.map((r) => r.uri)).toEqual([`ui://lazyprompt/prompt-widget.html?v=${WIDGET_VERSION}`]);
    const res = await rpc("resources/read", { uri: resources[0]!.uri });
    const contents = (res.json?.result?.contents ?? []) as { mimeType: string; text: string; _meta: { ui: Record<string, unknown>; "openai/widgetDescription": string } }[];
    expect(contents).toHaveLength(1);
    expect(contents[0]!.mimeType).toBe("text/html;profile=mcp-app");
    expect(contents[0]!.text).toBe(WIDGET_HTML);
    expect(contents[0]!._meta.ui).toMatchObject({ prefersBorder: true, csp: { connectDomains: [], resourceDomains: [] } });
    expect(contents[0]!._meta.ui).not.toHaveProperty("domain");
    expect(contents[0]!._meta["openai/widgetDescription"]).toBeTruthy();
  });

  it("includes ui.domain when MCP_WIDGET_DOMAIN is set", async () => {
    setMcpEnv({ MCP_WIDGET_DOMAIN: "www-lazyprompt-ai.oaiusercontent.com" });
    const list = await rpc("resources/list");
    const uri = ((list.json?.result?.resources ?? []) as { uri: string }[])[0]!.uri;
    const res = await rpc("resources/read", { uri });
    const c = ((res.json?.result?.contents ?? []) as { _meta: { ui: { domain?: string } } }[])[0]!;
    expect(c._meta.ui.domain).toBe("www-lazyprompt-ai.oaiusercontent.com");
  });
});

describe("read tools", () => {
  it("search_prompts returns the documented shape", async () => {
    const res = await callTool("search_prompts", { query: "cold email", limit: 3 });
    const sc = res.json?.result?.structuredContent as { query: string; total: number; results: Record<string, unknown>[] };
    expect(res.json?.result?.isError).toBeFalsy();
    expect(sc.query).toBe("cold email");
    expect(sc.total).toBe(1);
    expect(sc.results).toHaveLength(1);
    expect(sc.results[0]).toEqual({
      id: shortId, title: "Cold email opener", description: expect.any(String), category: "email-writing",
      tags: ["email", "sales"], models: ["chatgpt", "claude"], rating: 4.5, ratingCount: 4, copies: 0, variableCount: 2,
      url: absoluteUrl(`/p/${slug}`),
    });
    expect(res.json?.result?.content?.[0]?.text).toContain("Found 1 prompt for 'cold email'");
  });

  it("search_prompts without a query lists published prompts only and honours filters", async () => {
    const all = await callTool("search_prompts", {});
    const sc = all.json?.result?.structuredContent as { query: null; results: { title: string }[] };
    expect(sc.query).toBeNull();
    expect(sc.results.map((r) => r.title)).toEqual(["Cold email opener"]);
    const none = await callTool("search_prompts", { category: "no-such-category" });
    expect((none.json?.result?.structuredContent as { total: number }).total).toBe(0);
    expect(none.json?.result?.content?.[0]?.text).toContain("No prompts found");
  });

  it("search_prompts rejects bad input with a readable error", async () => {
    const res = await callTool("search_prompts", { limit: 99 });
    const failed = res.json?.error ?? (res.json?.result?.isError ? res.json.result : null);
    expect(failed).toBeTruthy();
    expect(res.text.toLowerCase()).toMatch(/limit|invalid|too big|<=/);
  });

  it("get_prompt accepts a shortId or the full slug and truncates long example output", async () => {
    for (const id of [shortId, slug, absoluteUrl(`/p/${slug}`)]) {
      const res = await callTool("get_prompt", { id });
      const p = (res.json?.result?.structuredContent as { prompt: Record<string, unknown> }).prompt;
      expect(p).toMatchObject({
        id: shortId, title: "Cold email opener", rating: 4.5, ratingCount: 4, license: "cc_by_4",
        category: { slug: "email-writing", name: "Email writing" }, url: absoluteUrl(`/p/${slug}`),
        exampleOutputTruncated: true,
      });
      expect((p.exampleOutput as string).length).toBeLessThanOrEqual(1500);
      expect(p.variables).toHaveLength(2);
      expect(p.body).toContain("{{recipient}}");
      expect(p.author).toEqual({ name: "Ada Author", username: expect.any(String) });
    }
  });

  it("get_prompt returns a readable error for unknown, malformed and unpublished ids", async () => {
    for (const id of ["zzzzzzz", "not a prompt", "x"]) {
      const res = await callTool("get_prompt", { id });
      expect(res.json?.result?.isError).toBe(true);
      expect(res.json?.result?.content?.[0]?.text).toMatch(/No published prompt/);
    }
    const hidden = await callTool("search_prompts", { query: "Hidden one" });
    expect((hidden.json?.result?.structuredContent as { total: number }).total).toBe(0);
  });

  it("render_prompt substitutes values, reports missing keys and builds open links", async () => {
    const partial = await callTool("render_prompt", { id: shortId, values: { offer: "a better CRM" } });
    const sc = partial.json?.result?.structuredContent as { id: string; text: string; missing: string[]; complete: boolean; openLinks: { model: string; url: string; prefilled: boolean }[] };
    expect(sc.id).toBe(shortId);
    expect(sc.missing).toEqual(["recipient"]);
    expect(sc.complete).toBe(false);
    expect(sc.text).toBe("Write a cold email to [Recipient] about a better CRM.");

    const full = await callTool("render_prompt", { id: slug, values: { recipient: "Dana", offer: "" } });
    const f = full.json?.result?.structuredContent as typeof sc;
    expect(f.complete).toBe(true);
    expect(f.missing).toEqual([]);
    expect(f.text).toBe("Write a cold email to Dana about our new product.");
    expect(f.openLinks.map((l) => l.model)).toEqual(["chatgpt", "claude", "gemini", "perplexity"]);
    expect(f.openLinks[0]).toEqual({ model: "chatgpt", url: `https://chatgpt.com/?q=${encodeURIComponent(f.text)}`, prefilled: true });
    expect(f.openLinks.find((l) => l.model === "gemini")).toMatchObject({ prefilled: false });
  });

  it("render_prompt validates values (count and length)", async () => {
    const tooMany = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));
    expect(JSON.stringify((await callTool("render_prompt", { id: shortId, values: tooMany })).json)).toMatch(/At most 20|invalid/i);
    expect(JSON.stringify((await callTool("render_prompt", { id: shortId, values: { recipient: "a".repeat(4001) } })).json)).toMatch(/invalid|too big|<=/i);
  });

  it("list_categories returns slug, name, description and promptCount", async () => {
    const res = await callTool("list_categories");
    const cats = (res.json?.result?.structuredContent as { categories: Record<string, unknown>[] }).categories;
    expect(cats.find((c) => c.slug === "email-writing")).toEqual({
      slug: "email-writing", name: "Email writing", description: "Description for Email writing", promptCount: 1,
    });
  });

  it("never exposes tokens, emails or timestamps in results", async () => {
    const outputs = [
      await callTool("search_prompts", { query: "email" }),
      await callTool("get_prompt", { id: shortId }),
      await callTool("render_prompt", { id: shortId, values: { recipient: "Dana" } }),
      await callTool("list_categories"),
    ];
    for (const o of outputs) {
      const text = JSON.stringify(o.json);
      expect(text.toLowerCase()).not.toContain("token");
      expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
      expect(text).not.toMatch(/"(created|updated|published)At"/);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    }
  });
});
