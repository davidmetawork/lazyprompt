import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { appRateLimits } from "@/db/schema";
import { checkRateLimit, clientIp, enforceRateLimit, hashIp } from "@/server/rate-limit";
import { resetDb } from "../../helpers/db";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

describe("checkRateLimit", () => {
  it("allows exactly `limit` calls per window; the N+1th is not ok", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit("t:a", 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[2]!.retryAfterSeconds).toBe(0);
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]!.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("keeps separate counters per key", async () => {
    await checkRateLimit("t:a", 1, 60);
    expect((await checkRateLimit("t:a", 1, 60)).ok).toBe(false);
    expect((await checkRateLimit("t:b", 1, 60)).ok).toBe(true);
  });

  it("starts a fresh window once the old one has expired", async () => {
    await checkRateLimit("t:w", 1, 60);
    expect((await checkRateLimit("t:w", 1, 60)).ok).toBe(false);
    await db.execute(sql`UPDATE app_rate_limits SET window_start = now() - interval '2 minutes' WHERE key = 't:w'`);
    const r = await checkRateLimit("t:w", 1, 60);
    expect(r).toMatchObject({ ok: true, remaining: 0 });
    const [row] = await db.select().from(appRateLimits);
    expect(row?.count).toBe(1);
  });

  it("is atomic under concurrency", async () => {
    const rs = await Promise.all(Array.from({ length: 20 }, () => checkRateLimit("t:c", 5, 60)));
    expect(rs.filter((r) => r.ok)).toHaveLength(5);
  });

  it("hashes over-long keys instead of failing", async () => {
    expect((await checkRateLimit(`k:${"x".repeat(500)}`, 1, 60)).ok).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  it("limits prompt_create to 3/day at trust 0 and 15/day at trust 1+", async () => {
    for (let i = 0; i < 3; i++) await enforceRateLimit("prompt_create", { userId: "u1", trustLevel: 0 });
    await expect(enforceRateLimit("prompt_create", { userId: "u1", trustLevel: 0 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    for (let i = 0; i < 15; i++) await enforceRateLimit("prompt_create", { userId: "u2", trustLevel: 1 });
    await expect(enforceRateLimit("prompt_create", { userId: "u2", trustLevel: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("enforces a 15 second comment burst limit", async () => {
    await enforceRateLimit("comment", { userId: "u3", trustLevel: 1 });
    await expect(enforceRateLimit("comment", { userId: "u3", trustLevel: 1 })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("limits tag_suggest to 60/min per IP and never stores raw IPs", async () => {
    for (let i = 0; i < 60; i++) await enforceRateLimit("tag_suggest", { ip: "203.0.113.9" });
    await expect(enforceRateLimit("tag_suggest", { ip: "203.0.113.9" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await enforceRateLimit("tag_suggest", { ip: "203.0.113.10" });
    const keys = (await db.select().from(appRateLimits)).map((r) => r.key);
    expect(keys.some((k) => k.includes("203.0.113"))).toBe(false);
    expect(keys).toContain(`tag_suggest:ip:${hashIp("203.0.113.9")}`);
  });

  it("mcp: 120/min per subject (not per IP) plus a 600/min per-IP ceiling", async () => {
    for (let i = 0; i < 120; i++) await enforceRateLimit("mcp", { userId: "subj-a", ip: "198.51.100.1" });
    await expect(enforceRateLimit("mcp", { userId: "subj-a", ip: "198.51.100.1" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    // Another subject behind the same shared egress IP is not throttled by subj-a.
    await enforceRateLimit("mcp", { userId: "subj-b", ip: "198.51.100.1" });
  });

  it("mcp: falls back to the IP hash as the subject", async () => {
    await enforceRateLimit("mcp", { ip: "198.51.100.2" });
    const keys = (await db.select().from(appRateLimits)).map((r) => r.key).sort();
    expect(keys).toEqual([`mcp:ip:${hashIp("198.51.100.2")}`, `mcp:s:ip:${hashIp("198.51.100.2")}`].sort());
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(new Headers({ "x-forwarded-for": "2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(new Headers())).toBeNull();
  });
});
