import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "@/db";
import { POST, GET, DELETE, OPTIONS } from "@/app/mcp/route";
import { hashIp } from "@/server/rate-limit";
import { createUser } from "../../helpers/factories";
import { resetDb } from "../../helpers/db";
import { callTool, mcpRequest, rawPost, rpc, unsetMcpEnv } from "./helpers";
import { mintToken, stubJwksFetch } from "./helpers-auth";

let restoreFetch: () => void;
afterAll(async () => { restoreFetch?.(); await closeDb(); });
beforeAll(() => { restoreFetch = stubJwksFetch(); });
beforeEach(async () => { await resetDb(); unsetMcpEnv(); });
afterEach(() => unsetMcpEnv());

const seed = (key: string, count: number) =>
  db.execute(sql`INSERT INTO app_rate_limits (key, window_start, count) VALUES (${key}, now(), ${count})`);

const ping = (headers: Record<string, string>, meta?: Record<string, unknown>) =>
  callTool("list_categories", {}, headers, meta);

describe("request size", () => {
  it("rejects bodies over 64 KB with HTTP 413 (declared and undeclared length)", async () => {
    const big = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(70 * 1024) } });
    const undeclared = await rawPost(big);
    expect(undeclared.status).toBe(413);
    expect(undeclared.json?.error?.message).toMatch(/too large/i);
    const declared = await POST(mcpRequest("{}", { "content-length": String(big.length) }));
    expect(declared.status).toBe(413);
  });

  it("passes malformed JSON through to the handler's parse error", async () => {
    const res = await rawPost("{not json");
    expect(res.status).toBe(400);
    expect(res.json?.error?.code).toBe(-32700);
  });
});

describe("rate limiting", () => {
  it("limits openai/subject values independently on the same IP (120/min each)", async () => {
    const headers = { "x-real-ip": "203.0.113.7" };
    const a = { "openai/subject": "v1/subject-a" };
    const b = { "openai/subject": "v1/subject-b" };
    for (let i = 0; i < 120; i++) {
      const res = await ping(headers, a);
      if (res.status !== 200) throw new Error(`call ${i + 1} unexpectedly returned ${res.status}`);
    }
    const limited = await ping(headers, a);
    expect(limited.status).toBe(429);
    expect(limited.json?.error?.message).toMatch(/Too many requests/);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    // another subject behind the same egress IP is unaffected
    const other = await ping(headers, b);
    expect(other.status).toBe(200);
    expect(other.json?.result?.isError).toBeFalsy();
  });

  it("applies a 600/min per-IP ceiling regardless of subject", async () => {
    const ip = "198.51.100.9";
    await seed(`mcp:ip:${hashIp(ip)}`, 599);
    const last = await ping({ "x-real-ip": ip }, { "openai/subject": "fresh-1" });
    expect(last.status).toBe(200);
    const over = await ping({ "x-real-ip": ip }, { "openai/subject": "fresh-2" });
    expect(over.status).toBe(429);
    // a different IP is fine
    expect((await ping({ "x-real-ip": "198.51.100.10" }, { "openai/subject": "fresh-2" })).status).toBe(200);
  });

  it("falls back to the IP hash as the subject when no subject is given", async () => {
    const ip = "192.0.2.44";
    await seed(`mcp:s:ip:${hashIp(ip)}`, 120);
    expect((await ping({ "x-real-ip": ip })).status).toBe(429);
    expect((await ping({ "x-real-ip": "192.0.2.45" })).status).toBe(200);
  });

  it("keys on the verified token user over a client-supplied openai/subject", async () => {
    const u = await createUser();
    await seed(`mcp:s:u:${u.id}`, 120);
    const token = await mintToken({ sub: u.id });
    const res = await ping({ authorization: `Bearer ${token}`, "x-real-ip": "192.0.2.50" }, { "openai/subject": "someone-else" });
    expect(res.status).toBe(429);
    // an invalid token does not count as a verified subject
    const anon = await ping({ authorization: "Bearer junk", "x-real-ip": "192.0.2.51" }, { "openai/subject": "someone-else" });
    expect(anon.status).toBe(200);
  });

  it("caps bearer-token verification attempts per IP before verifying anything", async () => {
    const ip = "192.0.2.70";
    await seed(`mcp:auth:${hashIp(ip)}`, 600);
    const withToken = await ping({ authorization: "Bearer junk", "x-real-ip": ip });
    expect(withToken.status).toBe(429);
    // requests without a bearer from the same IP are not affected by the verification cap
    expect((await ping({ "x-real-ip": ip })).status).toBe(200);
  });

  it("does not spend the pre-auth budget on VALID tokens (shared egress IPs), only on failed verifications", async () => {
    const ip = "192.0.2.71";
    const u = await createUser();
    const token = await mintToken({ sub: u.id });
    for (let i = 0; i < 3; i++) expect((await ping({ authorization: `Bearer ${token}`, "x-real-ip": ip })).status).toBe(200);
    const key = `mcp:auth:${hashIp(ip)}`;
    const after = async () => (await db.execute<{ count: number }>(sql`SELECT count FROM app_rate_limits WHERE key = ${key}`)).rows[0]?.count;
    expect(await after()).toBeUndefined();
    expect((await ping({ authorization: "Bearer junk", "x-real-ip": ip })).status).toBe(200);
    expect(Number(await after())).toBe(1);
  });

  it("refuses a bearer from an IP that used up its failed-verification budget before verifying it, even a valid one", async () => {
    const ip = "192.0.2.72";
    const u = await createUser();
    const token = await mintToken({ sub: u.id });
    await seed(`mcp:auth:${hashIp(ip)}`, 600);
    expect((await ping({ authorization: `Bearer ${token}`, "x-real-ip": ip })).status).toBe(429);
    expect((await ping({ authorization: `Bearer ${token}`, "x-real-ip": "192.0.2.73" })).status).toBe(200);
  });

  it("counts every POST (initialize and tools/list too)", async () => {
    const ip = "192.0.2.60";
    await seed(`mcp:s:ip:${hashIp(ip)}`, 120);
    expect((await rpc("tools/list", {}, { "x-real-ip": ip })).status).toBe(429);
  });
});

describe("transport", () => {
  it("answers OPTIONS with permissive CORS for the inspector", async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("adds CORS headers to POST responses and exposes WWW-Authenticate", async () => {
    const res = await POST(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
  });

  it("allows the browser headers an MCP client sends, not a wildcard", async () => {
    const res = await OPTIONS();
    const allowed = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase();
    for (const h of ["authorization", "content-type", "accept", "mcp-protocol-version", "mcp-session-id", "last-event-id"]) expect(allowed).toContain(h);
    expect(allowed).not.toContain("*");
  });

  it("GET and DELETE pass through the pre-auth cap and the per-IP rate limit like POST", async () => {
    const send = (method: "GET" | "DELETE", headers: Record<string, string>) =>
      (method === "GET" ? GET : DELETE)(new Request("http://localhost:3000/mcp", { method, headers: { accept: "text/event-stream", ...headers } }));

    const capped = "192.0.2.80";
    await seed(`mcp:auth:${hashIp(capped)}`, 600);
    for (const method of ["GET", "DELETE"] as const) {
      const res = await send(method, { authorization: "Bearer forged", "x-real-ip": capped });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).toBe("60");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      await res.body?.cancel();
    }

    const noisy = "192.0.2.81";
    await seed(`mcp:s:ip:${hashIp(noisy)}`, 120);
    for (const method of ["GET", "DELETE"] as const) {
      const res = await send(method, { "x-real-ip": noisy });
      expect(res.status).toBe(429);
      await res.body?.cancel();
    }

    // an IP under both limits still reaches the handler
    const fine = await send("GET", { "x-real-ip": "192.0.2.82" });
    expect(fine.status).not.toBe(429);
    await fine.body?.cancel();
  });

  it("stateless GET does not stream a session", async () => {
    const res = await GET(new Request("http://localhost:3000/mcp", { method: "GET", headers: { accept: "text/event-stream" } }));
    expect([200, 400, 405, 406]).toContain(res.status);
    await res.body?.cancel();
  });
});
