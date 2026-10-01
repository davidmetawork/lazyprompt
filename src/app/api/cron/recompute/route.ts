// GET /api/cron/recompute: daily Vercel cron (ARCHITECTURE.md section 4). Bearer CRON_SECRET only.
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { recomputeRankings, runMaintenance } from "@/server/ranking/recompute";
import { recomputeActiveTrustLevels } from "@/server/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;   // unset secret: always closed
  const header = req.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request): Promise<Response> {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { prompts, globalMean } = await recomputeRankings();
  const { eventsDeleted, limitsDeleted } = await runMaintenance();

  let trustUpdated: number | null = null;
  try {
    trustUpdated = await recomputeActiveTrustLevels();
  } catch (e) {
    console.error("[cron] recomputeActiveTrustLevels failed", e instanceof Error ? e.message : e);
  }

  return Response.json(
    { prompts, globalMean, eventsDeleted, limitsDeleted, trustUpdated },
    { headers: { "Cache-Control": "no-store" } },
  );
}
