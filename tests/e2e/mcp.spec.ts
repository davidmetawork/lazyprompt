import { createHash, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { E2E_BASE_URL } from "./helpers/constants";
import { waitForMagicLink } from "./helpers/auth";

// Runs against the real server (pnpm build + start). Flag-dependent checks only run when the server was started with
// MCP_OAUTH_ENABLED=true: `MCP_OAUTH_ENABLED=true pnpm test:e2e tests/e2e/mcp.spec.ts` (the webServer inherits process.env).
const OAUTH_ON = process.env.MCP_OAUTH_ENABLED === "true";
const MCP = `${E2E_BASE_URL}/mcp`;
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

// JSON-RPC payloads are only inspected loosely in these tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = { status: number; headers: Record<string, string>; json: { result?: Record<string, any>; error?: { message: string } } | null };

async function rpc(request: APIRequestContext, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<Rpc> {
  const res = await request.post(MCP, { headers: { ...HEADERS, ...headers }, data: { jsonrpc: "2.0", id: 1, method, params } });
  const text = await res.text();
  const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop() ?? text;
  let json: Rpc["json"] = null;
  try { json = JSON.parse(data); } catch { /* empty body */ }
  return { status: res.status(), headers: res.headers(), json };
}

const callTool = (request: APIRequestContext, name: string, args: Record<string, unknown>, headers: Record<string, string> = {}) =>
  rpc(request, "tools/call", { name, arguments: args }, headers);

test.describe("MCP over HTTP", () => {
  test("initialize, tools/list and the widget resource", async ({ request }) => {
    const init = await rpc(request, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "e2e", version: "1" } });
    expect(init.status).toBe(200);
    expect(init.json?.result?.serverInfo?.name).toBe("lazyprompt");

    const list = await rpc(request, "tools/list");
    const names = (list.json?.result?.tools as { name: string }[]).map((t) => t.name).sort();
    const read = ["get_prompt", "list_categories", "render_prompt", "search_prompts"];
    expect(names).toEqual(OAUTH_ON ? [...read, "rate_prompt", "save_prompt"].sort() : read);

    const resources = await rpc(request, "resources/list");
    const uri = resources.json?.result?.resources[0].uri as string;
    const widget = await rpc(request, "resources/read", { uri });
    const content = widget.json?.result?.contents[0];
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content.text).toContain("<!doctype html>");
  });

  test("search, open and fill in a fixture prompt", async ({ request }) => {
    const search = await callTool(request, "search_prompts", { query: "decline", limit: 3 });
    const results = search.json?.result?.structuredContent.results as { id: string; title: string; url: string }[];
    const hit = results.find((r) => /politely decline/i.test(r.title));
    expect(hit, "fixture prompt found").toBeTruthy();
    expect(hit!.url).toBe(`${E2E_BASE_URL}/p/${hit!.url.split("/p/")[1]}`);

    const got = await callTool(request, "get_prompt", { id: hit!.id });
    const prompt = got.json?.result?.structuredContent.prompt as { variables: { key: string }[]; body: string };
    expect(prompt.body.length).toBeGreaterThan(20);

    const values = Object.fromEntries(prompt.variables.map((v) => [v.key, "E2E-VALUE"]));
    const rendered = await callTool(request, "render_prompt", { id: hit!.id, values });
    const out = rendered.json?.result?.structuredContent as { text: string; complete: boolean; missing: string[]; openLinks: { model: string }[] };
    expect(out.complete).toBe(true);
    expect(out.missing).toEqual([]);
    if (prompt.variables.length > 0) expect(out.text).toContain("E2E-VALUE");
    expect(out.openLinks.length).toBeGreaterThan(0);

    const missing = await callTool(request, "render_prompt", { id: hit!.id, values: {} });
    expect(missing.json?.result?.structuredContent).toBeTruthy();

    const gone = await callTool(request, "get_prompt", { id: "zzzzzzz" });
    expect(gone.json?.result?.isError).toBe(true);
  });

  test("list_categories returns the fixture categories", async ({ request }) => {
    const res = await callTool(request, "list_categories", {});
    expect((res.json?.result?.structuredContent.categories as unknown[]).length).toBeGreaterThan(0);
  });

  test("CORS preflight answers for browser-based clients", async ({ request }) => {
    const res = await request.fetch(MCP, { method: "OPTIONS", headers: { origin: "https://inspector.example", "access-control-request-method": "POST" } });
    expect(res.status()).toBe(204);
    expect(res.headers()["access-control-allow-origin"]).toBe("*");
  });

  test("an oversized body is rejected with 413", async ({ request }) => {
    const res = await request.post(MCP, { headers: HEADERS, data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: { pad: "x".repeat(70_000) } } });
    expect(res.status()).toBe(413);
  });
});

test.describe("OAuth discovery", () => {
  test("protected resource metadata names the MCP resource and Better Auth", async ({ request }) => {
    for (const path of ["oauth-protected-resource", "oauth-protected-resource/mcp"]) {
      const res = await request.get(`/.well-known/${path}`);
      expect(res.status()).toBe(200);
      expect(res.headers()["access-control-allow-origin"]).toBe("*");
      const prm = await res.json();
      expect(prm.resource).toBe(MCP);
      expect(prm.authorization_servers).toEqual([`${E2E_BASE_URL}/api/auth`]);
    }
  });

  test("authorization server metadata advertises S256 and dynamic registration", async ({ request }) => {
    for (const path of ["oauth-authorization-server", "oauth-authorization-server/api/auth", "openid-configuration"]) {
      const meta = await (await request.get(`/.well-known/${path}`)).json();
      expect(meta.code_challenge_methods_supported).toContain("S256");
      expect(meta.registration_endpoint).toBe(`${E2E_BASE_URL}/api/auth/oauth2/register`);
      expect(meta.issuer).toBe(`${E2E_BASE_URL}/api/auth`);
    }
  });
});

test("the /apps page explains how to connect ChatGPT and Claude", async ({ page }) => {
  await page.goto("/apps");
  await expect(page.getByRole("heading", { level: 1, name: /chatgpt and claude/i })).toBeVisible();
  await expect(page.getByLabel("LazyPrompt connector URL", { exact: true })).toHaveText(MCP);
  await expect(page.getByText(/developer mode/i).first()).toBeVisible();
  await expect(page.getByText(/add custom connector/i).first()).toBeVisible();
  await expect(page.getByLabel("Claude Code command", { exact: true })).toContainText(`claude mcp add --transport http lazyprompt ${MCP}`);
  await expect(page.getByText("search_prompts", { exact: true })).toBeVisible();
});

test.describe("OAuth sign-in and consent (browser)", () => {
  test("an MCP client can register, sign in with a magic link, approve and get an audience-bound token", async ({ page, request }) => {
    const redirectUri = "http://127.0.0.1:9911/callback";
    const reg = await request.post("/api/auth/oauth2/register", {
      data: {
        client_name: "E2E Connector", application_type: "native", redirect_uris: [redirectUri], token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "openid prompts:read prompts:write",
      },
    });
    expect(reg.status()).toBe(201);
    const clientId = (await reg.json()).client_id as string;

    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid prompts:write", state: "e2e-state",
      code_challenge: challenge, code_challenge_method: "S256", resource: MCP,
    });
    await page.route("http://127.0.0.1:9911/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "callback" }));

    // 1. unauthenticated authorize -> our login wrapper, with the signed query
    await page.goto(`/api/auth/oauth2/authorize?${authorize}`);
    await expect(page).toHaveURL(/\/oauth\/sign-in\?/);
    await expect(page.getByRole("heading", { name: /sign in to lazyprompt/i })).toBeVisible();

    // 2. magic link; following it resumes the authorization and lands on the consent screen
    const email = `oauth-${Date.now()}@e2e.test`;
    const since = Date.now() - 1000;
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /email me a sign-in link/i }).click();
    await page.waitForURL(/\/sign-in\/check-email/);
    await page.goto(await waitForMagicLink(email, since));
    await expect(page).toHaveURL(/\/oauth\/consent\?/);
    await expect(page.getByRole("heading", { name: /connect e2e connector to lazyprompt/i })).toBeVisible();
    await expect(page.getByText("127.0.0.1:9911")).toBeVisible();
    await expect(page.getByText(/rate prompts and save them/i)).toBeVisible();

    // 3. approve -> redirected to the client's redirect URI with a code and our state
    await page.getByRole("button", { name: "Approve" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:9911\/callback\?/);
    const back = new URL(page.url());
    expect(back.searchParams.get("state")).toBe("e2e-state");
    const code = back.searchParams.get("code");
    expect(code).toBeTruthy();

    // 4. token exchange with PKCE and the resource -> JWT bound to /mcp
    const tok = await request.post("/api/auth/oauth2/token", {
      form: { grant_type: "authorization_code", code: code!, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier, resource: MCP },
    });
    expect(tok.status()).toBe(200);
    const token = (await tok.json()).access_token as string;
    const claims = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    expect(claims.iss).toBe(`${E2E_BASE_URL}/api/auth`);
    expect([claims.aud].flat()).toContain(MCP);
    expect(String(claims.scope)).toContain("prompts:write");

    // 5. the token is accepted by /mcp (read tools work anonymously and with a token)
    const authed = await callTool(request, "list_categories", {}, { authorization: `Bearer ${token}` });
    expect(authed.status).toBe(200);
    expect(authed.json?.result?.isError).toBeFalsy();

    if (OAUTH_ON) {
      const search = await callTool(request, "search_prompts", { limit: 1 });
      const id = (search.json?.result?.structuredContent.results as { id: string }[])[0]!.id;
      const rated = await callTool(request, "rate_prompt", { id, stars: 5 }, { authorization: `Bearer ${token}`, "user-agent": "claude-code" });
      // Past the gate: either the data layer's success result or its own error, never an auth challenge.
      expect(rated.status).toBe(200);
      expect(rated.json?.result?._meta?.["mcp/www_authenticate"]).toBeUndefined();
    }
  });

  test("denying returns an OAuth error to the client", async ({ page, request }) => {
    const redirectUri = "http://127.0.0.1:9912/callback";
    const reg = await request.post("/api/auth/oauth2/register", {
      data: { client_name: "Deny Connector", application_type: "native", redirect_uris: [redirectUri], token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"], scope: "openid prompts:write" },
    });
    const clientId = (await reg.json()).client_id as string;
    const authorize = new URLSearchParams({
      response_type: "code", client_id: clientId, redirect_uri: redirectUri, scope: "openid prompts:write", state: "deny-state",
      code_challenge: createHash("sha256").update("v").digest("base64url"), code_challenge_method: "S256", resource: MCP,
    });
    await page.route("http://127.0.0.1:9912/**", (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "callback" }));
    await page.goto(`/api/auth/oauth2/authorize?${authorize}`);
    const email = `deny-${Date.now()}@e2e.test`;
    const since = Date.now() - 1000;
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /email me a sign-in link/i }).click();
    await page.waitForURL(/\/sign-in\/check-email/);
    await page.goto(await waitForMagicLink(email, since));
    await page.getByRole("button", { name: "Deny" }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:9912\/callback\?/);
    const back = new URL(page.url());
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("code")).toBeNull();
  });
});

test.describe("write-tool challenges (needs MCP_OAUTH_ENABLED=true)", () => {
  test.skip(!OAUTH_ON, "server started without MCP_OAUTH_ENABLED");

  test("http401 for non-ChatGPT clients, in-result challenge for ChatGPT", async ({ request }) => {
    const claude = await callTool(request, "save_prompt", { id: "abc1234" }, { "user-agent": "claude-code/1.0" });
    expect(claude.status).toBe(401);
    expect(claude.headers["www-authenticate"]).toMatch(/resource_metadata=.*scope="prompts:write"/);
    const gpt = await callTool(request, "save_prompt", { id: "abc1234" }, { "user-agent": "openai-mcp/1.0" });
    expect(gpt.status).toBe(200);
    expect(gpt.json?.result?.isError).toBe(true);
    expect(gpt.json?.result?._meta["mcp/www_authenticate"][0]).toContain("resource_metadata");
  });
});
