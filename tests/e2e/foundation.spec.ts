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
