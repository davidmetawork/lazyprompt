// Create-if-missing + extensions + migrate for a database URL. Used by db:test:prepare, db:reset and the
// vitest / Playwright global setups. No server-only, no src/server imports.
import { Pool } from "pg";
import { adminUrlFor } from "./env-files";
import { runMigrations } from "../migrate";

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Creates the database named by `url` if it does not exist. Returns true when it was created. */
export async function ensureDatabase(url: string): Promise<boolean> {
  const { adminUrl, dbName } = adminUrlFor(url);
  if (!dbName) throw new Error(`No database name in ${url}`);
  const admin = new Pool({ connectionString: adminUrl, max: 1 });
  try {
    const found = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
    if (found.rowCount) return false;
    try {
      await admin.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
    } catch (e) {
      // Another process created it between the check and the create.
      if ((e as { code?: string }).code !== "42P04") throw e;
      return false;
    }
    return true;
  } finally {
    await admin.end();
  }
}

export async function ensureExtensions(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    await pool.query("CREATE EXTENSION IF NOT EXISTS citext");
  } finally {
    await pool.end();
  }
}

/** create (if missing) + extensions + migrate. */
export async function prepareDatabase(url: string): Promise<{ created: boolean }> {
  const created = await ensureDatabase(url);
  await ensureExtensions(url);
  await runMigrations(url);
  return { created };
}
