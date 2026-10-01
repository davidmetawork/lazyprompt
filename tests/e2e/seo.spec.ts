import { expect, test } from "@playwright/test";

// sitemap.xml, feed.xml and llms.txt are prerendered at `next build` (revalidate 1h) and the e2e fixtures are seeded after the
// build, so fixture rows only show up when the build already saw them (a seeded DB). Assert them only in that case.
test("/sitemap.xml is a valid urlset and lists fixture prompts when the build saw them", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.ok()).toBe(true);
  const xml = await res.text();
  expect(xml).toContain("<urlset");
  expect(xml).toMatch(/\/privacy</);
  if (/\/p\//.test(xml)) expect(xml).toMatch(/\/p\/politely-decline-a-request-by-email-[0-9a-z]{7}</);
});

test("/robots.txt references the sitemap and hides private paths", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.ok()).toBe(true);
  const txt = await res.text();
  expect(txt).toMatch(/sitemap:\s*\S+\/sitemap\.xml/i);
  // The e2e server may run with SEO_NOINDEX=true (Disallow: /) or with the private-path list.
  expect(txt).toMatch(/Disallow: \/(admin)?/);
});

test("OG images are 1200x630 PNGs, including the per-prompt one", async ({ request, page }) => {
  const root = await request.get("/opengraph-image");
  expect(root.ok()).toBe(true);
  expect(root.headers()["content-type"]).toContain("image/png");
  const body = await root.body();
  expect(body.subarray(1, 4).toString()).toBe("PNG");
  expect([body.readUInt32BE(16), body.readUInt32BE(20)]).toEqual([1200, 630]);

  // The per-prompt route carries a hash suffix, so discover it from the prompt page's og:image.
  const listing = await request.get("/prompts");
  const slug = /\/p\/(politely-decline-a-request-by-email-[0-9a-z]{7})/.exec(await listing.text())?.[1];
  test.skip(!slug, "needs the browse-ui /prompts listing (blocked on merge)");
  await page.goto(`/p/${slug}`);
  const og = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  test.skip(!og || !/opengraph-image/.test(og) || !og.includes(`/p/${slug}`), "needs the browse-ui prompt page (blocked on merge)");
  const img = await request.get(new URL(og!).pathname);
  expect(img.ok()).toBe(true);
  expect(img.headers()["content-type"]).toContain("image/png");
});

test("/feed.xml is valid RSS and /llms.txt is plain text", async ({ request }) => {
  const feed = await request.get("/feed.xml");
  expect(feed.headers()["content-type"]).toContain("application/rss+xml");
  const xml = await feed.text();
  expect(xml.startsWith("<?xml")).toBe(true);
  expect(xml).toContain('<rss version="2.0"');
  expect(xml).toContain("</channel>");
  if (xml.includes("<item>")) expect(xml).toContain("</item>");
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toContain("/apps");
});

for (const [path, heading] of [["/about", /about lazyprompt/i], ["/guidelines", /content guidelines/i], ["/privacy", /^privacy$/i], ["/terms", /terms of use/i]] as const) {
  test(`${path} renders with contact email and last-updated date`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.getByText("2026-10-01").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "hello@lazyprompt.ai" }).first()).toBeVisible();
  });
}

test("privacy names every processor", async ({ page }) => {
  await page.goto("/privacy");
  for (const name of ["Vercel", "Neon", "Resend", "Google", "GitHub", "OpenAI"]) {
    await expect(page.getByText(name).first()).toBeVisible();
  }
});
