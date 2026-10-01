import { expect, test, type Page } from "@playwright/test";

const DECLINE_TITLE = "Politely decline a request by email";

/** Opens the fixture prompt from the home page and returns its canonical path. */
async function openDeclinePrompt(page: Page): Promise<string> {
  await page.goto("/prompts?q=decline");
  await page.getByRole("link", { name: DECLINE_TITLE }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: DECLINE_TITLE })).toBeVisible();
  return new URL(page.url()).pathname;
}

test("home shows the hero, prompt sections and the category grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "The best AI prompts, ready to use" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top rated" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "New", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Browse by category" })).toBeVisible();
  await expect(page.getByRole("link", { name: DECLINE_TITLE }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^See all/ }).first()).toHaveAttribute("href", /\/prompts\?sort=/);
});

test("searching 'email' returns matching prompts and an active-filter chip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search prompts" }).first().fill("email");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/prompts\?q=email/);
  await expect(page.getByRole("link", { name: DECLINE_TITLE }).first()).toBeVisible();
  await expect(page.getByTestId("result-count")).toContainText("for");
  await expect(page.getByRole("link", { name: /Remove filter Search: email/ })).toBeVisible();
});

test("the category filter narrows results and the category page is scoped", async ({ page }) => {
  await page.goto("/prompts?category=writing");
  await expect(page.getByRole("link", { name: DECLINE_TITLE }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Product photo prompt for an image model" })).toHaveCount(0);
  await page.goto("/c/writing");
  await expect(page.getByRole("heading", { level: 1, name: "Writing" })).toBeVisible();
  await expect(page.getByRole("link", { name: DECLINE_TITLE }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Product photo prompt for an image model" })).toHaveCount(0);
});

test("an unknown category is a 404", async ({ page }) => {
  const res = await page.goto("/c/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("filling a variable updates the preview, survives a reload, and Copy shows a toast", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openDeclinePrompt(page);

  const preview = page.getByTestId("prompt-preview");
  await expect(preview).toContainText("[Request]");
  await page.getByLabel(/^Request/).fill("Speak at our offsite");
  await expect(preview).toContainText("Request I received: Speak at our offsite");
  await expect(preview).not.toContainText("[Request]");

  await page.reload();
  await expect(page.getByLabel(/^Request/)).toHaveValue("Speak at our offsite");

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.getByText("Copied", { exact: true }).first()).toBeVisible();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain("Request I received: Speak at our offsite");
  await expect(page.getByTestId("feedback-bar")).toBeVisible();
});

test("Open in ChatGPT copies and opens chatgpt.com with the filled prompt", async ({ page, context }) => {
  await context.route("https://chatgpt.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>stub</title>" }));
  await openDeclinePrompt(page);
  await page.getByLabel(/^Request/).fill("Join a panel");

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Open in ChatGPT" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/^https:\/\/chatgpt\.com\/\?q=/);
  expect(decodeURIComponent(new URL(popup.url()).searchParams.get("q") ?? "")).toContain("Request I received: Join a panel");
});

test("the prompt page is server rendered with article metadata and JSON-LD", async ({ page, request }) => {
  const path = await openDeclinePrompt(page);
  const html = await (await request.get(path)).text();
  expect(html).toContain("Write a short email declining this request.");
  expect(html).toContain('property="og:type" content="article"');
  expect(html).toContain('"@type":"CreativeWork"');
  expect(html).toContain('"@type":"BreadcrumbList"');
});

test("a wrong slug 308-redirects to the canonical slug; unknown ids are 404", async ({ page, request }) => {
  const canonical = await openDeclinePrompt(page);
  const shortId = canonical.slice(-7);
  const res = await request.get(`/p/wrong-title-${shortId}`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(new URL(res.headers().location!, "http://x").pathname).toBe(canonical);

  await page.goto(`/p/wrong-title-${shortId}`);
  await expect(page).toHaveURL(new RegExp(`${canonical}$`));

  const missing = await request.get("/p/nothing-here-zzzzzzz", { maxRedirects: 0 });
  expect(missing.status()).toBe(404);
});
