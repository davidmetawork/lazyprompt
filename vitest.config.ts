// EXACTLY three projects: unit (node), unit-dom (jsdom), integration (node, serial). Parallel packages must not edit this file.
// File-name rule: DOM tests are *.dom.test.tsx; everything else *.test.ts. No per-file environment docblocks.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { DEFAULT_TEST_DATABASE_URL, loadTestEnv } from "./scripts/lib/env-files";

// Per-worktree overrides live in a gitignored .env.test.local (see README "Parallel worktrees").
loadTestEnv();

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;

const env: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: testDatabaseUrl,
  TEST_DATABASE_URL: testDatabaseUrl,
  BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
  IP_HASH_SALT: "test-salt",
  CRON_SECRET: "test-cron",
  SEO_NOINDEX: "true",
};

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },   // native Vite tsconfig paths (replaces vite-tsconfig-paths)
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/helpers/setup.ts"],
          env,
        },
      },
      {
        extends: true,
        test: {
          name: "unit-dom",
          environment: "jsdom",
          include: ["tests/unit/**/*.dom.test.tsx"],
          setupFiles: ["tests/helpers/setup.ts", "tests/helpers/setup-dom.ts"],
          env,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/helpers/setup.ts"],
          globalSetup: ["tests/helpers/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env,
        },
      },
    ],
  },
});
