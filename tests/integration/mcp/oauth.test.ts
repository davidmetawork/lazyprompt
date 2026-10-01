import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/db";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createPrompt, createUser } from "../../helpers/factories";
import { resetDb } from "../../helpers/db";
import { base, callTool, initialize, rpc, setMcpEnv, unsetMcpEnv } from "./helpers";
import { mintToken, stubJwksFetch } from "./helpers-auth";

// data-write owns these; mocked so the wiring is tested independently of the package merge order.
const ratePrompt = vi.fn();
const setSaved = vi.fn();
vi.mock("@/server/ratings", () => ({ ratePrompt: (...a: unknown[]) => ratePrompt(...a), removeRating: vi.fn() }));
vi.mock("@/server/saves", () => ({ setSaved: (...a: unknown[]) => setSaved(...a), listSavedPrompts: vi.fn() }));

let restoreFetch: () => void;
afterAll(async () => { restoreFetch?.(); await closeDb(); });

const CHATGPT_UA = "openai-mcp/1.0";
let shortId: string;
let userId: string;
let promptId: string;

beforeAll(async () => {
  restoreFetch = stubJwksFetch();
  await resetDb();
  const author = await createUser({ trustLevel: 2 });
  const p = await createPrompt(author, { title: "OAuth target prompt" });
  shortId = p.shortId;
  promptId = p.id;
  userId = (await createUser({ trustLevel: 1 })).id;
});

beforeEach(() => {
  ratePrompt.mockReset();
  setSaved.mockReset();
  unsetMcpEnv();
});
afterEach(() => unsetMcpEnv());

const writeCall = (name: "rate_prompt" | "save_prompt", headers: Record<string, string> = {}) =>
  callTool(name, name === "rate_prompt" ? { id: shortId, stars: 5 } : { id: shortId }, headers);

describe("flag on: tool registration", () => {
  it("adds rate_prompt and save_prompt with oauth2 security schemes and the right annotations", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true" });
    const res = await rpc("tools/list", {}, { "user-agent": "claude-code" });
    expect(res.status).toBe(200);
    const tools = (res.json?.result?.tools ?? []) as { name: string; annotations: Record<string, boolean>; _meta: Record<string, unknown> }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["get_prompt", "list_categories", "rate_prompt", "render_prompt", "save_prompt", "search_prompts"]);
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(by.rate_prompt!.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: true, idempotentHint: true });
    expect(by.save_prompt!.annotations).toEqual({ readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true });
    for (const n of ["rate_prompt", "save_prompt"]) {
      expect(by[n]!._meta.securitySchemes).toEqual([{ type: "oauth2", scopes: ["prompts:write"] }]);
      expect(by[n]!._meta["openai/widgetAccessible"]).toBe(true);
      expect(by[n]!._meta.ui).toEqual({ visibility: ["model", "app"] });
    }
    expect(by.search_prompts!._meta.securitySchemes).toEqual([{ type: "noauth" }]);
  });

  it("keeps initialize, tools/list and read tools anonymous in every challenge mode", async () => {
    for (const mode of ["http401", "result", "auto"]) {
      setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: mode });
      expect((await initialize({ "user-agent": "claude-code" })).status).toBe(200);
      expect((await rpc("tools/list", {}, { "user-agent": "claude-code" })).status).toBe(200);
      const read = await callTool("list_categories", {}, { "user-agent": "claude-code" });
      expect(read.status).toBe(200);
      expect(read.json?.result?.isError).toBeFalsy();
    }
  });
});

describe("flag on: unauthenticated write calls", () => {
  it("http401 mode answers HTTP 401 with an RFC 9728 challenge", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "http401" });
    for (const name of ["rate_prompt", "save_prompt"] as const) {
      const res = await writeCall(name);
      expect(res.status).toBe(401);
      const challenge = res.headers.get("www-authenticate") ?? "";
      expect(challenge).toMatch(/^Bearer /);
      // RFC 9728 path-suffixed form for the /mcp resource; the well-known route serves it (and the bare form).
      expect(challenge).toContain(`resource_metadata="${base()}/.well-known/oauth-protected-resource/mcp"`);
      expect(challenge).toContain('scope="prompts:write"');
    }
  });

  it("result mode answers HTTP 200 with isError and _meta['mcp/www_authenticate']", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "result" });
    const res = await writeCall("rate_prompt", { "user-agent": "claude-code" });
    expect(res.status).toBe(200);
    expect(res.json?.result?.isError).toBe(true);
    expect(res.json?.result?._meta?.["mcp/www_authenticate"]).toEqual([
      `Bearer resource_metadata="${base()}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to LazyPrompt"`,
    ]);
    expect(ratePrompt).not.toHaveBeenCalled();
  });

  it("auto mode picks result for a ChatGPT user agent and http401 otherwise", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "auto" });
    const gpt = await writeCall("save_prompt", { "user-agent": CHATGPT_UA });
    expect(gpt.status).toBe(200);
    expect(gpt.json?.result?.isError).toBe(true);
    expect(gpt.json?.result?._meta?.["mcp/www_authenticate"]).toBeTruthy();
    const chat = await writeCall("save_prompt", { "user-agent": "Mozilla/5.0 ChatGPT-User" });
    expect(chat.status).toBe(200);
    const claude = await writeCall("save_prompt", { "user-agent": "claude-code/1.0" });
    expect(claude.status).toBe(401);
    expect(claude.headers.get("www-authenticate")).toContain("resource_metadata");
    const none = await writeCall("save_prompt");
    expect(none.status).toBe(401);
  });

  it("an invalid or wrong-audience token is treated as unauthenticated", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "http401" });
    const wrongAud = await mintToken({ sub: userId, aud: "https://elsewhere.example/mcp" });
    expect((await writeCall("rate_prompt", { authorization: `Bearer ${wrongAud}` })).status).toBe(401);
    expect((await writeCall("rate_prompt", { authorization: "Bearer not-a-jwt" })).status).toBe(401);
    const expired = await mintToken({ sub: userId, expiresInSeconds: -60 });
    expect((await writeCall("rate_prompt", { authorization: `Bearer ${expired}` })).status).toBe(401);
    // result mode: the bad token is just anonymous, so the tool answers with the in-result challenge
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "result" });
    const res = await writeCall("rate_prompt", { authorization: "Bearer not-a-jwt" });
    expect(res.status).toBe(200);
    expect(res.json?.result?._meta?.["mcp/www_authenticate"]).toBeTruthy();
    // read tools still work with a junk bearer
    expect((await callTool("list_categories", {}, { authorization: "Bearer not-a-jwt" })).json?.result?.isError).toBeFalsy();
  });
});

describe("flag on: authenticated write calls", () => {
  it("rate_prompt resolves the prompt and calls ratePrompt as the token's user", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "http401" });
    ratePrompt.mockResolvedValue({ ratingAvg: 4.25, ratingCount: 8, viewerRating: 5 });
    const token = await mintToken({ sub: userId });
    const res = await writeCall("rate_prompt", { authorization: `Bearer ${token}`, "user-agent": "claude-code" });
    expect(res.status).toBe(200);
    expect(res.json?.result?.isError).toBeFalsy();
    expect(ratePrompt).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), promptId, 5);
    expect(res.json?.result?.structuredContent).toEqual({ id: shortId, yourRating: 5, rating: 4.3, ratingCount: 8 });
    expect(res.text).not.toContain(token);
  });

  it("save_prompt calls setSaved(add) as the token's user", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "result" });
    setSaved.mockResolvedValue({ saved: true, saveCount: 3 });
    const token = await mintToken({ sub: userId });
    const res = await writeCall("save_prompt", { authorization: `Bearer ${token}`, "user-agent": CHATGPT_UA });
    expect(setSaved).toHaveBeenCalledWith(expect.objectContaining({ id: userId }), promptId, true);
    expect(res.json?.result?.structuredContent).toEqual({ id: shortId, saved: true, saveCount: 3 });
  });

  it("rejects banned users and unknown users without calling the data layer", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "http401" });
    const banned = await createUser({ banned: true });
    const res = await writeCall("rate_prompt", { authorization: `Bearer ${await mintToken({ sub: banned.id })}` });
    expect(res.json?.result?.isError).toBe(true);
    expect(res.json?.result?.content?.[0]?.text).toMatch(/cannot do this/);
    expect(res.json?.result?._meta?.["mcp/www_authenticate"]).toBeUndefined();
    const ghost = await writeCall("save_prompt", { authorization: `Bearer ${await mintToken({ sub: "ghost-user" })}` });
    expect(ghost.json?.result?.isError).toBe(true);
    expect(ratePrompt).not.toHaveBeenCalled();
    expect(setSaved).not.toHaveBeenCalled();
    // role/ban come from the DB, not the token
    await db.update(user).set({ banned: false }).where(eq(user.id, banned.id));
  });

  it("a token with only prompts:read cannot write (403 insufficient_scope in http401 mode, in-result challenge otherwise)", async () => {
    const token = await mintToken({ sub: userId, scope: "openid prompts:read" });
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "http401" });
    const gated = await writeCall("rate_prompt", { authorization: `Bearer ${token}` });
    expect(gated.status).toBe(403);
    expect(gated.headers.get("www-authenticate")).toContain("insufficient_scope");
    setMcpEnv({ MCP_OAUTH_ENABLED: "true", MCP_AUTH_CHALLENGE: "result" });
    const res = await writeCall("rate_prompt", { authorization: `Bearer ${token}` });
    expect(res.json?.result?.isError).toBe(true);
    expect(res.json?.result?._meta?.["mcp/www_authenticate"]).toBeTruthy();
    expect(ratePrompt).not.toHaveBeenCalled();
  });

  it("read tools are unaffected by a valid token", async () => {
    setMcpEnv({ MCP_OAUTH_ENABLED: "true" });
    const token = await mintToken({ sub: userId, scope: "openid prompts:read" });
    const res = await callTool("get_prompt", { id: shortId }, { authorization: `Bearer ${token}` });
    expect(res.json?.result?.isError).toBeFalsy();
  });
});
