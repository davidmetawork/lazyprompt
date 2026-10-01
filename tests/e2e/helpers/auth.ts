import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { E2E_MAGIC_LINK_SINK } from "./constants";

function readSink(): { email: string; url: string; ts: number }[] {
  const file = resolve(process.cwd(), E2E_MAGIC_LINK_SINK);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Waits for a magic link addressed to `email` that was written after `since`. */
export async function waitForMagicLink(email: string, since: number): Promise<string> {
  let url: string | undefined;
  await expect.poll(() => {
    url = readSink().filter((e) => e.email.toLowerCase() === email.toLowerCase() && e.ts >= since).pop()?.url;
    return url;
  }, { timeout: 15_000, message: `magic link for ${email}` }).toBeTruthy();
  return url!;
}

/** Signs in through the real UI: submit the magic-link form, read the link from the dev sink, follow it. */
export async function signIn(page: Page, email: string, next = "/"): Promise<void> {
  const since = Date.now() - 1000;
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await page.waitForURL(/\/sign-in\/check-email/);
  const url = await waitForMagicLink(email, since);
  await page.goto(url);
  await expect(page.getByTestId("user-menu")).toBeVisible();
}
