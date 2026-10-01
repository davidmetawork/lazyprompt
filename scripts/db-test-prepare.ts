// pnpm db:test:prepare: creates (if missing) and migrates the databases named by TEST_DATABASE_URL and
// TEST_DATABASE_URL_E2E, enabling pg_trgm + citext. Safe to run repeatedly and per worktree.
import { DEFAULT_E2E_DATABASE_URL, DEFAULT_TEST_DATABASE_URL, isMain, loadTestEnv } from "./lib/env-files";
import { prepareDatabase } from "./lib/db-admin";

async function main() {
  loadTestEnv();
  const urls = [
    process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
    process.env.TEST_DATABASE_URL_E2E ?? DEFAULT_E2E_DATABASE_URL,
  ];
  for (const url of [...new Set(urls)]) {
    const { created } = await prepareDatabase(url);
    console.log(`${created ? "created and migrated" : "migrated"}: ${url.replace(/\/\/[^@/]*@/, "//***@")}`);
  }
}

if (isMain("scripts/db-test-prepare.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
