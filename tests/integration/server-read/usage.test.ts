import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { prompts, usageEvents } from "@/db/schema";
import { hashActor, recordUsageEvent } from "@/server/usage";
import { resetDb } from "../../helpers/db";
import { createPrompt, createUser } from "../../helpers/factories";

afterAll(async () => { await closeDb(); });
beforeEach(async () => { await resetDb(); });

const counters = async (id: string) => {
  const [row] = await db.select({
    copy: prompts.copyCount, open: prompts.openCount, render: prompts.renderCount,
    worked: prompts.workedCount, notWorked: prompts.notWorkedCount,
  }).from(prompts).where(eq(prompts.id, id));
  return row!;
};
const eventRows = () => db.select().from(usageEvents);

describe("hashActor", () => {
  it("is a 64-char hex sha256, deterministic, and never contains the raw inputs", () => {
    const h = hashActor({ ip: "203.0.113.9", userAgent: "UA/1.0" });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashActor({ ip: "203.0.113.9", userAgent: "UA/1.0" }));
    expect(h).not.toContain("203.0.113.9");
  });

  it("uses the user id when present (ignoring ip/ua) and distinguishes actors", () => {
    expect(hashActor({ userId: "u1", ip: "1.1.1.1", userAgent: "a" })).toBe(hashActor({ userId: "u1", ip: "2.2.2.2", userAgent: "b" }));
    expect(hashActor({ userId: "u1" })).not.toBe(hashActor({ userId: "u2" }));
    expect(hashActor({ ip: "1.1.1.1", userAgent: "a" })).not.toBe(hashActor({ ip: "1.1.1.1", userAgent: "b" }));
    expect(hashActor({ ip: "1.1.1.1", userAgent: "a" })).not.toBe(hashActor({ ip: "1.1.1.2", userAgent: "a" }));
    expect(hashActor({})).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("recordUsageEvent", () => {
  it("counts the first event per actor/type/day and increments only the matching counter", async () => {
    const p = await createPrompt(await createUser());
    expect(await recordUsageEvent({ promptId: p.id, type: "copy", source: "web", ip: "9.9.9.9", userAgent: "x" })).toEqual({ counted: true });
    expect(await counters(p.id)).toMatchObject({ copy: 1, open: 0, render: 0, worked: 0, notWorked: 0 });
    const [row] = await eventRows();
    expect(row).toMatchObject({ promptId: p.id, type: "copy", source: "web", userId: null, model: null });
    expect(row!.actorHash).toBe(hashActor({ ip: "9.9.9.9" }));   // anonymous web visitors hash the IP only
  });

  it("dedupes the same actor copying twice on one day", async () => {
    const p = await createPrompt(await createUser());
    const input = { promptId: p.id, type: "copy" as const, source: "web" as const, ip: "9.9.9.9", userAgent: "x" };
    expect((await recordUsageEvent(input)).counted).toBe(true);
    expect((await recordUsageEvent(input)).counted).toBe(false);
    expect((await recordUsageEvent(input)).counted).toBe(false);
    expect((await counters(p.id)).copy).toBe(1);
    expect(await eventRows()).toHaveLength(1);
  });

  it("counts different actors and different event types separately", async () => {
    const p = await createPrompt(await createUser());
    const base = { promptId: p.id, source: "web" as const };
    await recordUsageEvent({ ...base, type: "copy", ip: "1.1.1.1", userAgent: "a" });
    await recordUsageEvent({ ...base, type: "copy", ip: "1.1.1.2", userAgent: "a" });
    await recordUsageEvent({ ...base, type: "open", ip: "1.1.1.1", userAgent: "a", model: "claude" });
    await recordUsageEvent({ ...base, type: "render", ip: "1.1.1.1", userAgent: "a" });
    await recordUsageEvent({ ...base, type: "worked", ip: "1.1.1.4", userAgent: "a" });
    await recordUsageEvent({ ...base, type: "not_worked", ip: "1.1.1.3", userAgent: "a" });
    expect(await counters(p.id)).toEqual({ copy: 2, open: 1, render: 1, worked: 1, notWorked: 1 });
    expect((await eventRows()).find((r) => r.type === "open")?.model).toBe("claude");
  });

  it("stores user_id and dedupes a signed-in user across IPs", async () => {
    const ada = await createUser();
    const p = await createPrompt(await createUser());
    expect((await recordUsageEvent({ promptId: p.id, type: "copy", source: "web", userId: ada.id, ip: "1.1.1.1" })).counted).toBe(true);
    expect((await recordUsageEvent({ promptId: p.id, type: "copy", source: "mcp", userId: ada.id, ip: "8.8.8.8" })).counted).toBe(false);
    const rows = await eventRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ada.id, source: "web", actorHash: hashActor({ userId: ada.id }) });
  });

  it("anonymous web visitors dedupe by IP only: rotating the user agent does not mint new actors", async () => {
    const p = await createPrompt(await createUser());
    const base = { promptId: p.id, type: "copy" as const, source: "web" as const, ip: "7.7.7.7" };
    expect((await recordUsageEvent({ ...base, userAgent: "UA/1" })).counted).toBe(true);
    for (const ua of ["UA/2", "UA/3", "UA/4"]) expect((await recordUsageEvent({ ...base, userAgent: ua })).counted).toBe(false);
    expect((await counters(p.id)).copy).toBe(1);
  });

  it("caps anonymous web events at 3 per prompt per IP per day; other IPs, signed-in users and a new day are unaffected", async () => {
    const p = await createPrompt(await createUser());
    const ada = await createUser();
    const types = ["copy", "open", "render", "worked", "not_worked"] as const;
    const counted: boolean[] = [];
    for (const type of types) counted.push((await recordUsageEvent({ promptId: p.id, type, source: "web", ip: "7.7.7.8" })).counted);
    expect(counted).toEqual([true, true, true, false, false]);
    expect((await recordUsageEvent({ promptId: p.id, type: "worked", source: "web", ip: "7.7.7.9" })).counted).toBe(true);
    expect((await recordUsageEvent({ promptId: p.id, type: "worked", source: "web", userId: ada.id, ip: "7.7.7.8" })).counted).toBe(true);
    await db.execute(sql`UPDATE usage_events SET day = current_date - 1`);
    expect((await recordUsageEvent({ promptId: p.id, type: "worked", source: "web", ip: "7.7.7.8" })).counted).toBe(true);
  });

  it("an explicit actorKey identifies the actor (MCP): same key dedupes, different keys behind one IP are distinct", async () => {
    const p = await createPrompt(await createUser());
    const base = { promptId: p.id, type: "render" as const, source: "mcp" as const, ip: "198.51.100.1", userAgent: "chatgpt" };
    expect((await recordUsageEvent({ ...base, actorKey: "o:subject-a" })).counted).toBe(true);
    expect((await recordUsageEvent({ ...base, actorKey: "o:subject-a" })).counted).toBe(false);
    for (const key of ["o:subject-b", "o:subject-c", "o:subject-d", "o:subject-e"]) {
      expect((await recordUsageEvent({ ...base, actorKey: key })).counted).toBe(true);   // no anonymous cap for keyed actors
    }
    expect(hashActor({ actorKey: "o:subject-a" })).not.toBe(hashActor({ userId: "o:subject-a" }));
  });

  it("counts again on a new day", async () => {
    const p = await createPrompt(await createUser());
    const input = { promptId: p.id, type: "copy" as const, source: "web" as const, ip: "5.5.5.5", userAgent: "x" };
    await recordUsageEvent(input);
    await db.execute(sql`UPDATE usage_events SET day = current_date - 1`);
    expect((await recordUsageEvent(input)).counted).toBe(true);
    expect((await counters(p.id)).copy).toBe(2);
  });

  it("ignores unpublished and unknown prompts without throwing or bumping counters", async () => {
    const author = await createUser();
    const pending = await createPrompt(author, { status: "pending" });
    const hidden = await createPrompt(author, { status: "hidden" });
    for (const id of [pending.id, hidden.id, "11111111-1111-4111-8111-111111111111"]) {
      expect(await recordUsageEvent({ promptId: id, type: "copy", source: "web", ip: "1.1.1.1" })).toEqual({ counted: false });
    }
    expect(await eventRows()).toHaveLength(0);
    expect((await counters(pending.id)).copy).toBe(0);
  });

  it("validates its input", async () => {
    const p = await createPrompt(await createUser());
    await expect(recordUsageEvent({ promptId: "not-a-uuid", type: "copy", source: "web" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordUsageEvent({ promptId: p.id, type: "bogus" as never, source: "web" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordUsageEvent({ promptId: p.id, type: "copy", source: "tv" as never })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordUsageEvent({ promptId: p.id, type: "copy", source: "web", model: "gpt-9" as never })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
