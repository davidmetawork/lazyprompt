// Admin / moderation e2e. Needs the data packages merged (the admin pages call real server functions).
// Setup data that other packages' UI would normally create (a pending prompt, a reported comment) is inserted
// directly through the test factories, so these tests stay independent of the submit/comment/report forms.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_DATABASE_URL } from "./helpers/constants";
import { signIn } from "./helpers/auth";

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function seed() {
  process.env.DATABASE_URL = E2E_DATABASE_URL;           // before src/db is first loaded
  const factories = await import("../helpers/factories");
  const { db } = await import("../../src/db");
  // Playwright's loader wraps a barrel that only `export *`s into { default: {...} }, so unwrap it.
  const schemaModule = await import("../../src/db/schema");
  const schema = ("default" in schemaModule ? schemaModule.default : schemaModule) as typeof schemaModule;
  return { ...factories, db, schema };
}

async function newSignedInPage(browser: Browser, email: string, next = "/"): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // The admin shell has no site header (so no user menu to assert on): sign in on the site, then open `next`.
  await signIn(page, email);
  if (next !== "/") await page.goto(next);
  return page;
}

test("non-admins get a 404 on admin pages and no emails leak", async ({ browser }) => {
  const email = `member-${uniq()}@e2e.test`;
  const page = await newSignedInPage(browser, email);
  for (const path of ["/admin", "/admin/users", "/admin/queue", "/admin/log"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    const html = await page.content();
    expect(html).not.toContain("@e2e.test");
    expect(html).not.toContain(E2E_ADMIN_EMAIL);
  }
  await page.context().close();
});

test("admin approves a trust-0 user's pending prompt and it becomes public", async ({ browser }) => {
  const { createUser, createPrompt } = await seed();
  const author = await createUser({ trustLevel: 0 });
  const title = `Pending prompt ${uniq()} for approval`;
  const prompt = await createPrompt(author, { status: "pending", title });

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  expect((await anonPage.goto(`/p/${prompt.slug}`))?.status()).toBe(404);

  const admin = await newSignedInPage(browser, E2E_ADMIN_EMAIL, "/admin/queue");
  await admin.goto("/admin/queue");
  const row = admin.getByRole("listitem").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(admin.getByText("Approved prompt")).toBeVisible();
  await expect(row).toHaveCount(0);

  const res = await anonPage.goto(`/p/${prompt.slug}`);
  expect(res?.status()).toBe(200);
  await expect(anonPage.getByRole("heading", { name: title })).toBeVisible();
  await anon.close();
  await admin.context().close();
});

test("reject requires a reason in a confirmation dialog", async ({ browser }) => {
  const { createUser, createPrompt } = await seed();
  const author = await createUser({ trustLevel: 0 });
  const title = `Rejectable prompt ${uniq()} here`;
  await createPrompt(author, { status: "pending", title });

  const admin = await newSignedInPage(browser, E2E_ADMIN_EMAIL, "/admin/queue");
  await admin.goto("/admin/queue");
  const row = admin.getByRole("listitem").filter({ hasText: title });
  await row.getByRole("button", { name: "Reject" }).click();
  const dialog = admin.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Reject prompt" });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel(/reason/i).fill("Not a reusable prompt");
  await confirm.click();
  await expect(admin.getByText("Rejected prompt")).toBeVisible();
  await expect(row).toHaveCount(0);
  await admin.context().close();
});

test("admin dismisses a report on a comment and the log records it", async ({ browser }) => {
  const { createUser, createPrompt, db, schema } = await seed();
  const author = await createUser({ trustLevel: 1 });
  const reporter = await createUser({ trustLevel: 1 });
  const prompt = await createPrompt(author, { title: `Reported thread ${uniq()} prompt` });
  const commentBody = `A debatable comment ${uniq()}`;
  const [comment] = await db.insert(schema.comments).values({
    promptId: prompt.id, authorId: author.id, body: commentBody, openReportCount: 1,
  }).returning({ id: schema.comments.id });
  await db.insert(schema.reports).values({
    reporterId: reporter.id, targetType: "comment", targetId: comment!.id, promptId: prompt.id,
    reason: "spam", details: `looks like spam ${uniq()}`,
  });

  const admin = await newSignedInPage(browser, E2E_ADMIN_EMAIL, "/admin/reports");
  await admin.goto("/admin/reports");
  const card = admin.getByRole("listitem").filter({ hasText: `@${reporter.username}` }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Dismiss" }).click();
  const dialog = admin.getByRole("alertdialog");
  await dialog.getByLabel(/note/i).fill("Not spam, just blunt");
  await dialog.getByRole("button", { name: "Dismiss report" }).click();
  await expect(admin.getByText("Report dismissed")).toBeVisible();

  await admin.goto("/admin/log");
  const logRow = admin.getByRole("row").filter({ hasText: "Not spam, just blunt" });
  await expect(logRow).toBeVisible();
  await expect(logRow).toContainText("Dismiss report");
  await admin.context().close();
});

test("admin bans a user: session is gone, sign-in is blocked, and self-ban is not offered", async ({ browser }) => {
  const email = `banme-${uniq()}@e2e.test`;
  const member = await newSignedInPage(browser, email);
  await member.goto("/");
  await expect(member.getByTestId("user-menu")).toBeVisible();

  const admin = await newSignedInPage(browser, E2E_ADMIN_EMAIL, "/admin/users");
  await admin.goto(`/admin/users?q=${encodeURIComponent(email)}`);
  const row = admin.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^ban/i }).click();
  const dialog = admin.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Ban user" });
  await expect(confirm).toBeDisabled();                       // a reason is required
  await dialog.getByLabel(/reason/i).fill("Repeated spam");
  await confirm.click();
  await expect(admin.getByText(/^Banned @/)).toBeVisible();

  // The banned user's session is gone.
  await member.reload();
  await expect(member.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(member.getByTestId("user-menu")).toHaveCount(0);

  // Sign-in is blocked: the magic link does not produce a session.
  const retry = await browser.newContext();
  const retryPage = await retry.newPage();
  await expect(signIn(retryPage, email)).rejects.toThrow();
  await retry.close();

  // The admin has no ban control on their own row.
  await admin.goto(`/admin/users?q=${encodeURIComponent(E2E_ADMIN_EMAIL)}`);
  const own = admin.getByRole("row").filter({ hasText: E2E_ADMIN_EMAIL });
  await expect(own).toBeVisible();
  await expect(own.getByRole("button", { name: /ban/i })).toHaveCount(0);

  await member.context().close();
  await admin.context().close();
});
