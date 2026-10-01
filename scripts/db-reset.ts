// pnpm db:reset: DESTROYS all data in DATABASE_URL, then re-migrates. Local databases only.
import { Pool } from "pg";
import { isLocalDatabaseUrl, isMain, loadDevEnv } from "./lib/env-files";
import { runMigrations } from "./migrate";

async function main() {
  loadDevEnv();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!isLocalDatabaseUrl(url)) throw new Error("db:reset refuses to run against a non-local database");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
    await pool.query("CREATE SCHEMA public");
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  console.log("database reset and migrated");
}

if (isMain("scripts/db-reset.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
