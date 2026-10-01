// Drizzle + pg Pool, cached on globalThis (survives HMR and shared across route modules).
// Created lazily so importing this module never needs DATABASE_URL. No "server-only" (tsx/CLI safe).
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { attachDatabasePool } from "@vercel/functions";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const g = globalThis as unknown as { __lpPool?: Pool; __lpDb?: Db };

function getDb(): Db {
  if (g.__lpDb) return g.__lpDb;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  if (process.env.VERCEL) attachDatabasePool(pool);
  g.__lpPool = pool;
  g.__lpDb = drizzle({ client: pool, schema });
  return g.__lpDb;
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

/** Closes the shared pool (scripts and tests). */
export async function closeDb(): Promise<void> {
  const pool = g.__lpPool;
  g.__lpPool = undefined;
  g.__lpDb = undefined;
  if (pool) await pool.end();
}

export { schema };
