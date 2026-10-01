// Applies drizzle/*.sql migrations. Uses DATABASE_URL_UNPOOLED ?? DATABASE_URL (override with MIGRATE_DATABASE_URL).
import { resolve } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { isMain, loadDevEnv, REPO_ROOT } from "./lib/env-files";

export async function runMigrations(url: string): Promise<void> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: resolve(REPO_ROOT, "drizzle") });
  } finally {
    await pool.end();
  }
}

async function main() {
  loadDevEnv();
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");
  await runMigrations(url);
  console.log("migrations applied");
}

if (isMain("scripts/migrate.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
