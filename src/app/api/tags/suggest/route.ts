import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { clientIp, enforceRateLimit } from "@/server/rate-limit";
import { suggestTags } from "@/server/taxonomy";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/tags/suggest?q=wr  ->  TagSummary[] (at most 8). Rate limited per IP (tag_suggest: 60/min). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  if (q.length < 1 || q.length > 32) {
    return NextResponse.json({ error: "q must be 1-32 characters" }, { status: 400, headers: NO_STORE });
  }
  try {
    await enforceRateLimit("tag_suggest", { ip: clientIp(request.headers) ?? undefined });
    const tags = await suggestTags(q, 8);
    return NextResponse.json(tags.slice(0, 8), { headers: NO_STORE });
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") {
      return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { ...NO_STORE, "Retry-After": "60" } });
    }
    console.error("[api/tags/suggest]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500, headers: NO_STORE });
  }
}
