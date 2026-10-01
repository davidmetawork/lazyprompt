import { afterAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth/server";
import { closeDb } from "@/db";
import { GET, OPTIONS } from "@/app/api/well-known/[...path]/route";
import { base } from "./helpers";

afterAll(async () => { await closeDb(); });

const get = (path: string) =>
  GET(new Request(`${base()}/.well-known/${path}`), { params: Promise.resolve({ path: path.split("/") }) });

describe("protected resource metadata", () => {
  it.each(["oauth-protected-resource", "oauth-protected-resource/mcp"])("%s names the MCP resource and Better Auth as the AS", async (path) => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const prm = await res.json();
    expect(prm.resource).toBe(`${base()}/mcp`);
    expect(prm.authorization_servers).toEqual([`${base()}/api/auth`]);
    expect(prm.bearer_methods_supported).toEqual(["header"]);
    expect(prm.scopes_supported).toEqual(expect.arrayContaining(["prompts:read", "prompts:write"]));
  });
});

describe("authorization server metadata", () => {
  it.each(["oauth-authorization-server", "oauth-authorization-server/api/auth", "openid-configuration", "openid-configuration/api/auth"])(
    "%s advertises S256, DCR and the Better Auth endpoints", async (path) => {
      const res = await get(path);
      expect(res.status).toBe(200);
      const meta = await res.json();
      expect(meta.issuer).toBe(`${base()}/api/auth`);
      expect(meta.code_challenge_methods_supported).toContain("S256");
      expect(meta.registration_endpoint).toBe(`${base()}/api/auth/oauth2/register`);
      expect(meta.authorization_endpoint).toBe(`${base()}/api/auth/oauth2/authorize`);
      expect(meta.token_endpoint).toBe(`${base()}/api/auth/oauth2/token`);
      expect(meta.jwks_uri).toBe(`${base()}/api/auth/jwks`);
      expect(meta.scopes_supported).toEqual(expect.arrayContaining(["prompts:write"]));
    });
});

describe("routing", () => {
  it("returns 404 for unknown documents and answers OPTIONS with CORS", async () => {
    expect((await get("something-else")).status).toBe(404);
    expect((await get("oauth-protected-resource/other")).status).toBe(404);
    const opt = await OPTIONS();
    expect(opt.status).toBe(204);
    expect(opt.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("caching", () => {
  it("caches good documents briefly and never caches an error", async () => {
    const ok = await get("oauth-authorization-server");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("public, max-age=60");

    const spy = vi.spyOn(auth, "handler").mockResolvedValue(new Response("down", { status: 500 }));
    try {
      const down = await get("oauth-authorization-server");
      expect(down.status).toBe(503);
      expect(down.headers.get("cache-control")).toBe("no-store");
    } finally {
      spy.mockRestore();
    }
  });
});
