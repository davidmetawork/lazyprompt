// Vitest globalSetup for the integration project: create TEST_DATABASE_URL's database if missing, enable
// extensions and migrate. Parallel worktrees point TEST_DATABASE_URL at different databases (.env.test.local).
import { DEFAULT_TEST_DATABASE_URL, loadTestEnv } from "../../scripts/lib/env-files";
import { prepareDatabase } from "../../scripts/lib/db-admin";

export default async function setup() {
  loadTestEnv();
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  await prepareDatabase(url);
}
