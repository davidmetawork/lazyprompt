import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** 200 only when the database answers; a load balancer or uptime monitor must see 503 when it does not. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[health] db check failed", e instanceof Error ? e.name : "unknown");
    return Response.json({ ok: false, db: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
