import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Truncates every table in the public schema (app + Better Auth) with RESTART IDENTITY CASCADE.
 * Refuses to run against a database whose name does not look like a test/e2e database.
 * `keep` lists tables to leave alone (the e2e reset keeps `jwks` and `oauth_resource`, which a RUNNING server
 * seeds once at startup).
 */
export async function resetDb(opts: { keep?: string[] } = {}): Promise<void> {
  const name = await db.execute<{ db: string }>(sql`select current_database() as db`);
  const dbName = name.rows[0]?.db ?? "";
  if (!/(test|e2e)/i.test(dbName)) {
    throw new Error(`resetDb refuses to truncate "${dbName}" (name must contain "test" or "e2e")`);
  }
  const res = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const keep = new Set(opts.keep ?? []);
  const tables = res.rows.filter((r) => !keep.has(r.tablename)).map((r) => `"public"."${r.tablename}"`);
  if (tables.length) await db.execute(sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`));
}
