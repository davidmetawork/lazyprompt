// Community flows against the integrated app (needs the data packages and browse-ui's /p/[slug] page, so it
// cannot pass in the community-ui branch alone). Every test signs in as a fresh trust-0 member.
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./helpers/auth";

const FIXTURE_TITLE = "Politely decline a request by email";

function member(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

async function openFixture(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: FIXTURE_TITLE }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: FIXTURE_TITLE })).toBeVisible();
}

test("rating a prompt 4 stars updates the average", async ({ page }) => {
  await signIn(page, member("rater"));
  await openFixture(page);
  const rate = page.locator("#rate");
  await page.getByRole("radio", { name: /^4 stars/ }).click();
  await expect(page.getByRole("radio", { name: /^4 stars/ })).toHaveAttribute("aria-checked", "true");
  await expect(rate.getByText("Your rating: 4 of 5")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio", { name: /^4 stars/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#rate").getByLabel(/out of 5 stars from \d+ rating/)).toBeVisible();
});

test("comment, reply, edit and delete", async ({ page }) => {
  await signIn(page, member("commenter"));
  await openFixture(page);
  const comments = page.locator("#comments");

  await comments.getByLabel("Add a comment").fill("Works great for declining invitations.");
  await comments.getByRole("button", { name: "Post comment" }).click();
  // A trust-0 member's plain-text comment is visible immediately; if the policy holds it, they still see it as pending.
  const top = comments.getByTestId("comment").filter({ hasText: "Works great for declining invitations." }).first();
  await expect(top).toBeVisible();

  await top.getByRole("button", { name: "Reply", exact: true }).click();
  await comments.getByLabel(/^Reply to/).fill("Replying to myself.");
  await comments.getByRole("button", { name: "Post reply" }).click();
  const reply = comments.locator('[data-depth="1"]').filter({ hasText: "Replying to myself." });
  await expect(reply).toBeVisible();
  // Replies are one level deep: no Reply button on a reply.
  await expect(reply.getByRole("button", { name: "Reply", exact: true })).toHaveCount(0);

  await top.getByRole("button", { name: "Edit" }).first().click();
  await comments.getByLabel("Edit your comment").fill("Edited: works great.");
  await comments.getByRole("button", { name: "Save" }).click();
  await expect(comments.getByText("Edited: works great.")).toBeVisible();
  await expect(comments.getByText("(edited)").first()).toBeVisible();

  const edited = comments.getByTestId("comment").filter({ hasText: "Edited: works great." }).first();
  await edited.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("button", { name: "Delete comment" }).click();
  await expect(comments.getByText("Edited: works great.")).toHaveCount(0);
});

test("saving a prompt lists it under /me/saved", async ({ page }) => {
  await signIn(page, member("saver"));
  await openFixture(page);
  await page.getByRole("button", { name: /^save/i }).click();
  await expect(page.getByRole("button", { name: /^saved/i })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/me/saved");
  await expect(page.getByRole("link", { name: FIXTURE_TITLE })).toBeVisible();
});

test("a new member's prompt is pending in /me/prompts", async ({ page }) => {
  await signIn(page, member("author"));
  await page.goto("/submit");
  const title = `Summarize a meeting transcript ${Date.now()}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Description").fill("Turn a messy meeting transcript into decisions, owners and next steps.");
  await page.getByLabel("Prompt text").fill(
    "Summarize the meeting transcript below into decisions, action items with owners, and open questions.\n\nTranscript: {{transcript:long}}\nAudience: {{audience:select(team, executives)|team}}",
  );
  await expect(page.getByTestId("variable-row")).toHaveCount(2);
  await page.getByLabel("Category").selectOption({ index: 1 });
  await page.getByRole("combobox").fill("meetings");
  await page.getByRole("combobox").press("Enter");
  await page.getByRole("button", { name: "Submit prompt" }).click();
  await expect(page).toHaveURL(/\/me\/prompts\?submitted=1/);
  await expect(page.getByText(/New members' prompts are reviewed before publishing/)).toBeVisible();
  const card = page.getByRole("article").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText("pending")).toBeVisible();
});

test("forking a prompt prefills the submit form", async ({ page }) => {
  await signIn(page, member("forker"));
  await openFixture(page);
  await page.getByRole("link", { name: /fork/i }).click();
  await expect(page).toHaveURL(/\/submit\?fork=/);
  await expect(page.getByLabel("Title")).toHaveValue(`Fork of ${FIXTURE_TITLE}`);
  await expect(page.getByLabel("Prompt text")).toHaveValue(/Write a short email declining this request/);
  await expect(page.getByTestId("variable-row")).toHaveCount(3);
});

test("reporting a prompt shows a success toast", async ({ page }) => {
  await signIn(page, member("reporter"));
  await openFixture(page);
  await page.getByRole("button", { name: "Report" }).first().click();
  await page.getByRole("radio", { name: "Spam or advertising" }).click();
  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("Thanks, we will take a look")).toBeVisible();
});

test("updating the username in /settings", async ({ page }) => {
  await signIn(page, member("settings"));
  await page.goto("/settings");
  const username = `renamed-${Date.now().toString(36)}`;
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Bio").fill("I write prompts.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Profile updated")).toBeVisible();
  await page.goto("/me");
  await expect(page).toHaveURL(new RegExp(`/u/${username}$`));
  await expect(page.getByText("I write prompts.")).toBeVisible();
});

test("an expired session sends a rating to sign-in", async ({ page, context }) => {
  await signIn(page, member("expired"));
  await openFixture(page);
  await context.clearCookies();
  await page.getByRole("radio", { name: /^3 stars/ }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=/);
});
