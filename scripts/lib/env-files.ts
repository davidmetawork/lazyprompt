// Tiny dotenv loader for tsx scripts, drizzle-kit, vitest and Playwright configs.
// Never overrides variables that are already set in the real environment.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// All entry points (pnpm scripts, drizzle-kit, vitest, playwright) run with the repo root as cwd.
export const REPO_ROOT = process.cwd();

/** True when `file` (e.g. "scripts/migrate.ts") is the entry script of this process. */
export function isMain(file: string): boolean {
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  return entry.endsWith(file);
}

export function loadEnvFiles(files: string[], root: string = REPO_ROOT): void {
  for (const f of files) {
    const p = resolve(root, f);
    if (existsSync(p)) process.loadEnvFile(p);
  }
}

/** Dev/scripts: real env > .env.local > .env */
export function loadDevEnv(): void {
  loadEnvFiles([".env.local", ".env"]);
}

/** Tests: real env > .env.test.local > .env.local > .env */
export function loadTestEnv(): void {
  loadEnvFiles([".env.test.local", ".env.local", ".env"]);
}

export const DEFAULT_TEST_DATABASE_URL = "postgres://localhost:5432/lazyprompt_test";
export const DEFAULT_E2E_DATABASE_URL = "postgres://localhost:5432/lazyprompt_e2e";
export const DEFAULT_E2E_PORT = 3100;

/** Connection string pointing at the maintenance database of the same server (for CREATE DATABASE). */
export function adminUrlFor(url: string): { adminUrl: string; dbName: string } {
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  u.pathname = "/postgres";
  return { adminUrl: u.toString(), dbName };
}
