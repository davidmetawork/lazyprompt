import { describe, expect, it } from "vitest";
import { PROTECTED_TOOLS, peekBody, selectChallengeMode, wwwAuthenticateValue } from "@/mcp/config";
import { claimsToAuthInfo, scopesOf } from "@/mcp/claims";

describe("selectChallengeMode", () => {
  it("honours explicit http401 and result regardless of the user agent", () => {
    expect(selectChallengeMode("http401", "openai-mcp/1.0")).toBe("http401");
    expect(selectChallengeMode("result", "claude-code")).toBe("result");
    expect(selectChallengeMode("result", null)).toBe("result");
  });

  it("auto answers ChatGPT in-result and everything else with an HTTP 401", () => {
    expect(selectChallengeMode("auto", "openai-mcp/1.0")).toBe("result");
    expect(selectChallengeMode("auto", "Mozilla/5.0 (compatible; ChatGPT-User/1.0)")).toBe("result");
    expect(selectChallengeMode("auto", "OPENAI-Something")).toBe("result");
    expect(selectChallengeMode("auto", "claude-code/1.2")).toBe("http401");
    expect(selectChallengeMode("auto", "node")).toBe("http401");
    expect(selectChallengeMode("auto", null)).toBe("http401");
    expect(selectChallengeMode("auto", "")).toBe("http401");
  });
});

describe("wwwAuthenticateValue", () => {
  it("points at the protected-resource metadata and asks the user to sign in", () => {
    expect(wwwAuthenticateValue("https://lazyprompt.ai")).toBe(
      'Bearer resource_metadata="https://lazyprompt.ai/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to LazyPrompt"',
    );
  });
});

describe("peekBody", () => {
  const call = (name: string, extra: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: {}, ...extra } });

  it("flags tools/call for the protected tools only", () => {
    expect([...PROTECTED_TOOLS].sort()).toEqual(["rate_prompt", "save_prompt"]);
    expect(peekBody(call("rate_prompt")).protectedCall).toBe(true);
    expect(peekBody(call("save_prompt")).protectedCall).toBe(true);
    expect(peekBody(call("search_prompts")).protectedCall).toBe(false);
    expect(peekBody({ jsonrpc: "2.0", id: 1, method: "tools/list" }).protectedCall).toBe(false);
    expect(peekBody({ jsonrpc: "2.0", id: 1, method: "initialize", params: { name: "rate_prompt" } }).protectedCall).toBe(false);
  });

  it("extracts the method, tool name, id and openai/subject", () => {
    const p = peekBody(call("get_prompt", { _meta: { "openai/subject": "v1/abc" } }));
    expect(p).toMatchObject({ method: "tools/call", toolName: "get_prompt", subject: "v1/abc", id: 7 });
  });

  it("caps and type-checks the subject", () => {
    expect(peekBody(call("x", { _meta: { "openai/subject": "a".repeat(500) } })).subject).toHaveLength(128);
    expect(peekBody(call("x", { _meta: { "openai/subject": 42 } })).subject).toBeUndefined();
    expect(peekBody(call("x", { _meta: { "openai/subject": "" } })).subject).toBeUndefined();
  });

  it("handles batches and junk input", () => {
    expect(peekBody([call("search_prompts"), call("rate_prompt")]).protectedCall).toBe(true);
    expect(peekBody([]).protectedCall).toBe(false);
    for (const junk of [null, 5, "x", { method: 5 }, { params: 1 }]) expect(peekBody(junk).protectedCall).toBe(false);
  });
});

describe("claimsToAuthInfo", () => {
  it("maps verified claims to AuthInfo with the user id in extra", () => {
    const info = claimsToAuthInfo("tok", { sub: "u_1", scope: "openid prompts:write", azp: "client-9", exp: 1234 });
    expect(info).toEqual({ token: "tok", clientId: "client-9", scopes: ["openid", "prompts:write"], expiresAt: 1234, extra: { userId: "u_1" } });
  });

  it("rejects claims without a subject and tolerates array/absent scopes", () => {
    expect(claimsToAuthInfo("tok", { scope: "x" })).toBeUndefined();
    expect(claimsToAuthInfo("tok", { sub: "" })).toBeUndefined();
    expect(scopesOf({ scope: ["a", 1, "b"] as unknown as string })).toEqual(["a", "b"]);
    expect(scopesOf({})).toEqual([]);
    expect(claimsToAuthInfo("tok", { sub: "u" })?.clientId).toBe("unknown");
  });
});
