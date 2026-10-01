import { expect, test } from "@playwright/test";
import { E2E_ADMIN_EMAIL } from "./helpers/constants";
import { signIn } from "./helpers/auth";

test("home renders the fixture prompts", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Politely decline a request by email" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Product photo prompt for an image model" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("/api/health reports ok with a working database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test("protected routes redirect anonymous visitors to sign-in with a safe next", async ({ page }) => {
  await page.goto("/submit");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fsubmit/);
  await expect(page.getByRole("heading", { name: /sign in to lazyprompt/i })).toBeVisible();
});

test("magic-link sign-in shows the user menu and creates a profile", async ({ page }) => {
  const email = `member-${Date.now()}@e2e.test`;
  await signIn(page, email);
  await page.getByTestId("user-menu").click();
  await expect(page.getByRole("menuitem", { name: /my prompts/i })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /admin/i })).toHaveCount(0);
});

test("an ADMIN_EMAILS user gets the admin menu entry", async ({ page }) => {
  await signIn(page, E2E_ADMIN_EMAIL);
  await page.getByTestId("user-menu").click();
  await expect(page.getByRole("menuitem", { name: /admin/i })).toBeVisible();
});

test("signing out returns to the signed-out header", async ({ page }) => {
  await signIn(page, `signout-${Date.now()}@e2e.test`);
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("sign-in shows a message after a failed magic link or OAuth attempt", async ({ page }) => {
  await page.goto("/sign-in?error=link&from=link");
  await expect(page.getByRole("alert").filter({ hasText: /expired or was already used/i })).toBeVisible();
  await page.goto("/sign-in?error=access_denied&from=oauth");
  await expect(page.getByRole("alert").filter({ hasText: /did not complete/i })).toBeVisible();
});

test("a control-character next never leaves the site after sign-in", async ({ page }) => {
  await signIn(page, `redirect-${Date.now()}@e2e.test`, "/\t/evil.com");
  expect(new URL(page.url()).hostname).toBe("localhost");
});

test("phones get a Submit shortcut in the header", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("banner").getByRole("link", { name: "Submit a prompt" })).toBeVisible();
});

test("the suspended page explains the suspension and offers sign-out", async ({ page }) => {
  await page.goto("/suspended");
  await expect(page.getByRole("heading", { name: /account has been suspended/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
});
