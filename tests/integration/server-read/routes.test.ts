import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { appRateLimits, appSettings, prompts, usageEvents } from "@/db/schema";
import { getBaseUrl } from "@/lib/base-url";
import { resetEnvCache } from "@/lib/env";
import { POST as postEvent } from "@/app/api/events/route";
import { GET as getCron } from "@/app/api/cron/recompute/route";
import { hashIp } from "@/server/rate-limit";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";
import { addAnonEvents } from "./helpers";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

const origin = () => getBaseUrl();
const eventReq = (body: unknown, headers: Record<string, string> = {}, raw = false) =>
  new Request(`${origin()}/api/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "user-agent": "vitest", "x-real-ip": "198.51.100.7", ...headers },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const copyCount = async (id: string) => (await db.select({ c: prompts.copyCount }).from(prompts).where(eq(prompts.id, id)))[0]!.c;

describe("POST /api/events", () => {
  it("returns 204 for a same-origin event and counts it once per actor per day", async () => {
    const p = await createPrompt(await createUser());
    const body = { promptId: p.id, type: "copy", model: "claude" };
    const res = await postEvent(eventReq(body));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect((await postEvent(eventReq(body))).status).toBe(204);   // duplicate: still 204, not counted
    expect(await copyCount(p.id)).toBe(1);
    const [row] = await db.select().from(usageEvents);
    expect(row).toMatchObject({ promptId: p.id, type: "copy", model: "claude", source: "web", userId: null });

    // a different actor (other IP) counts
    expect((await postEvent(eventReq(body, { "x-real-ip": "198.51.100.8" }))).status).toBe(204);
    expect(await copyCount(p.id)).toBe(2);
  });

  it("accepts a matching Origin header without sec-fetch-site", async () => {
    const p = await createPrompt(await createUser());
    const res = await postEvent(eventReq({ promptId: p.id, type: "open" }, { origin: origin(), "sec-fetch-site": "" }));
    expect(res.status).toBe(204);
  });

  it("rejects cross-origin and origin-less requests with 403 and records nothing", async () => {
    const p = await createPrompt(await createUser());
    const body = { promptId: p.id, type: "copy" };
    expect((await postEvent(eventReq(body, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await postEvent(eventReq(body, { origin: "https://evil.example", "sec-fetch-site": "" }))).status).toBe(403);
    expect((await postEvent(eventReq(body, { "sec-fetch-site": "same-site" }))).status).toBe(403);
    expect((await postEvent(eventReq(body, { "sec-fetch-site": "" }))).status).toBe(403);
    expect(await copyCount(p.id)).toBe(0);
  });

  it("accepts text/plain bodies (navigator.sendBeacon)", async () => {
    const p = await createPrompt(await createUser());
    const res = await postEvent(eventReq(JSON.stringify({ promptId: p.id, type: "worked" }), { "content-type": "text/plain;charset=UTF-8" }, true));
    expect(res.status).toBe(204);
    const [row] = await db.select({ w: prompts.workedCount }).from(prompts).where(eq(prompts.id, p.id));
    expect(row!.w).toBe(1);
  });

  it("rejects an oversize body (> 1 KB) with 413, before and without a content-length", async () => {
    const p = await createPrompt(await createUser());
    const big = JSON.stringify({ promptId: p.id, type: "copy", pad: "x".repeat(2000) });
    expect((await postEvent(eventReq(big, {}, true))).status).toBe(413);
    // streamed body without a declared length
    const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const req = new Request(`${origin()}/api/events`, {
      method: "POST", headers: { "content-type": "text/plain", "sec-fetch-site": "same-origin" }, body: stream, duplex: "half",
    } as RequestInit);
    expect((await postEvent(req)).status).toBe(413);
    expect(await copyCount(p.id)).toBe(0);
  });

  it("rejects malformed JSON, invalid payloads and foreign content types", async () => {
    const p = await createPrompt(await createUser());
    expect((await postEvent(eventReq("{nope", {}, true))).status).toBe(400);
    expect((await postEvent(eventReq("", {}, true))).status).toBe(400);
    expect((await postEvent(eventReq({ promptId: "nope", type: "copy" }))).status).toBe(400);
    expect((await postEvent(eventReq({ promptId: p.id, type: "explode" }))).status).toBe(400);
    expect((await postEvent(eventReq({ promptId: p.id, type: "copy", model: "gpt-9" }))).status).toBe(400);
    expect((await postEvent(eventReq("promptId=1", { "content-type": "application/x-www-form-urlencoded" }, true))).status).toBe(415);
    expect(await copyCount(p.id)).toBe(0);
  });

  it("returns 204 but counts nothing for an unpublished or unknown prompt", async () => {
    const pending = await createPrompt(await createUser(), { status: "pending" });
    expect((await postEvent(eventReq({ promptId: pending.id, type: "copy" }))).status).toBe(204);
    expect((await postEvent(eventReq({ promptId: "11111111-1111-4111-8111-111111111111", type: "copy" }))).status).toBe(204);
    expect(await db.select().from(usageEvents)).toHaveLength(0);
  });

  it("answers 429 once the per-actor limit (300/hour) is exhausted", async () => {
    const p = await createPrompt(await createUser());
    await db.insert(appRateLimits).values({ key: `event:ip:${hashIp("198.51.100.7")}`, windowStart: new Date(), count: 300 });
    const res = await postEvent(eventReq({ promptId: p.id, type: "copy" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await copyCount(p.id)).toBe(0);
  });
});

describe("GET /api/cron/recompute", () => {
  const original = process.env.CRON_SECRET;
  const cronReq = (auth?: string) =>
    new Request(`${origin()}/api/cron/recompute`, { headers: auth === undefined ? {} : { authorization: auth } });
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original;
    resetEnvCache();
  });

  it("returns 401 without a bearer or with the wrong one", async () => {
    process.env.CRON_SECRET = "s3cret"; resetEnvCache();
    expect((await getCron(cronReq())).status).toBe(401);
    expect((await getCron(cronReq("Bearer nope"))).status).toBe(401);
    expect((await getCron(cronReq("s3cret"))).status).toBe(401);
    expect((await getCron(cronReq("Bearer s3cret2"))).status).toBe(401);
  });

  it("is always 401 when CRON_SECRET is unset, even for an empty or 'undefined' bearer", async () => {
    delete process.env.CRON_SECRET; resetEnvCache();
    expect((await getCron(cronReq("Bearer undefined"))).status).toBe(401);
    expect((await getCron(cronReq("Bearer "))).status).toBe(401);
    expect((await getCron(cronReq())).status).toBe(401);
  });

  it("recomputes, runs maintenance and reports (trustUpdated null while users.ts is a stub)", async () => {
    process.env.CRON_SECRET = "s3cret"; resetEnvCache();
    const ada = await createUser();
    const p = await createPrompt(ada);
    await addAnonEvents(p.id, 3);
    await db.insert(usageEvents).values({ promptId: p.id, type: "copy", actorHash: "ancient", createdAt: new Date(Date.now() - 100 * 86_400_000) });
    await db.insert(appRateLimits).values({ key: "old:key", windowStart: new Date(Date.now() - 5 * 86_400_000), count: 1 });

    const res = await getCron(cronReq("Bearer s3cret"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ prompts: 1, globalMean: 4, eventsDeleted: 1, limitsDeleted: 1 });
    expect("trustUpdated" in json).toBe(true);
    expect(json.trustUpdated === null || typeof json.trustUpdated === "number").toBe(true);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const keys = (await db.select().from(appSettings)).map((r) => r.key).sort();
    expect(keys).toEqual(["ranking.computedAt", "ranking.globalMean"]);
    const [row] = await db.select({ t: prompts.trendingScore }).from(prompts).where(eq(prompts.id, p.id));
    expect(row!.t).toBeGreaterThan(0);
  });
});
