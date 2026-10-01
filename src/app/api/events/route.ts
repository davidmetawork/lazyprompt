// POST /api/events: beacon endpoint for copy/open/worked/not_worked usage events (ARCHITECTURE.md sections 4, 11, 13).
import { z } from "zod";
import { getViewer } from "@/auth/viewer";
import { getBaseUrl } from "@/lib/base-url";
import { AppError } from "@/lib/errors";
import { usageEventInputSchema } from "@/lib/validation";
import { clientIp, enforceRateLimit } from "@/server/rate-limit";
import { recordUsageEvent } from "@/server/usage";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;

function isSameOrigin(req: Request): boolean {
  if (req.headers.get("sec-fetch-site") === "same-origin") return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(getBaseUrl()).host;
  } catch {
    return false;
  }
}

/** Reads at most MAX_BODY_BYTES; returns null when the body is larger. Never buffers an oversize body. */
async function readLimitedText(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { buf.set(c, offset); offset += c.byteLength; }
  return new TextDecoder().decode(buf);
}

const status = (code: number, headers?: Record<string, string>) => new Response(null, { status: code, headers });

export async function POST(req: Request): Promise<Response> {
  if (!isSameOrigin(req)) return status(403);

  // application/json, or text/plain (navigator.sendBeacon with a string/Blob); anything else is not ours.
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type && type !== "application/json" && type !== "text/plain") return status(415);

  const text = await readLimitedText(req);
  if (text === null) return status(413);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return status(400);
  }
  const parsed = usageEventInputSchema.safeParse(json);
  if (!parsed.success) return status(400);

  try {
    const viewer = await getViewer().catch(() => null);
    const ip = clientIp(req.headers);
    await enforceRateLimit("event", { userId: viewer?.id, ip: ip ?? undefined, trustLevel: viewer?.trustLevel });
    await recordUsageEvent({
      promptId: parsed.data.promptId,
      type: parsed.data.type,
      model: parsed.data.model ?? null,
      source: "web",
      userId: viewer?.id ?? null,
      ip,
      userAgent: req.headers.get("user-agent"),
    });
    return status(204);
  } catch (e) {
    if (e instanceof AppError) {
      if (e.code === "RATE_LIMITED") return status(429, { "Retry-After": "60" });
      if (e.code === "VALIDATION") return status(400);
    }
    if (e instanceof z.ZodError) return status(400);
    console.error("[events] failed", e instanceof Error ? e.message : e);
    return status(500);
  }
}
