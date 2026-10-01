// Playwright (chromium). Every resource is env-overridable so parallel worktrees never collide:
//   E2E_PORT (default 3100), TEST_DATABASE_URL_E2E (default postgres://localhost:5432/lazyprompt_e2e),
//   E2E_MAGIC_LINK_SINK. Put per-worktree values in a gitignored .env.test.local.
import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./scripts/lib/env-files";

loadTestEnv();

import { E2E_ADMIN_EMAIL, E2E_BASE_URL, E2E_DATABASE_URL, E2E_MAGIC_LINK_SINK, E2E_PORT } from "./tests/e2e/helpers/constants";

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./tests/e2e/helpers/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: E2E_BASE_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Migrate first so `next build` (which loads the auth plugins) finds the schema.
    command: `pnpm db:test:prepare && pnpm build && pnpm start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/health`,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DATABASE_URL_UNPOOLED: E2E_DATABASE_URL,
      TEST_DATABASE_URL_E2E: E2E_DATABASE_URL,
      BETTER_AUTH_URL: E2E_BASE_URL,
      BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
      IP_HASH_SALT: "e2e-salt",
      CRON_SECRET: "e2e-cron",
      MAGIC_LINK_DEV_SINK: E2E_MAGIC_LINK_SINK,
      ADMIN_EMAILS: E2E_ADMIN_EMAIL,
      SEO_NOINDEX: "false",
      PORT: String(E2E_PORT),
    },
  },
});
