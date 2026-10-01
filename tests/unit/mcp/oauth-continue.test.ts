import { describe, expect, it } from "vitest";
import { authorizePathFromQuery, redirectHost, splitScopes, toUrlSearchParams } from "@/mcp/oauth-continue";
import { describeScope } from "@/mcp/oauth-metadata";

const query = {
  response_type: "code", client_id: "abc", redirect_uri: "https://claude.ai/api/mcp/auth_callback", scope: "openid prompts:write",
  state: "xyz", code_challenge: "chal", code_challenge_method: "S256", resource: "https://lazyprompt.ai/mcp",
  exp: "1790000000", sig: "signature",
};

describe("authorizePathFromQuery", () => {
  it("rebuilds the authorize request without the signature params", () => {
    const path = authorizePathFromQuery(query)!;
    expect(path.startsWith("/api/auth/oauth2/authorize?")).toBe(true);
    const q = new URLSearchParams(path.split("?")[1]);
    expect(q.get("sig")).toBeNull();
    expect(q.get("exp")).toBeNull();
    expect(q.get("client_id")).toBe("abc");
    expect(q.get("redirect_uri")).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("resource")).toBe("https://lazyprompt.ai/mcp");
  });

  it("drops prompt=login but keeps other prompt values", () => {
    expect(authorizePathFromQuery({ ...query, prompt: "login" })).not.toMatch(/[?&]prompt=/);
    expect(authorizePathFromQuery({ ...query, prompt: "login consent" })).toContain("prompt=consent");
  });

  it("always yields a same-origin path and rejects non-authorize queries", () => {
    expect(authorizePathFromQuery(query)!.startsWith("/")).toBe(true);
    expect(authorizePathFromQuery({ client_id: "abc" })).toBeNull();
    expect(authorizePathFromQuery({})).toBeNull();
    // a hostile redirect_uri stays a parameter value, never part of the path
    const hostile = authorizePathFromQuery({ ...query, redirect_uri: "//evil.example/x" })!;
    expect(hostile.startsWith("/api/auth/oauth2/authorize?")).toBe(true);
  });

  it("handles repeated parameters", () => {
    const q = toUrlSearchParams({ resource: ["a", "b"], x: undefined, y: "1" });
    expect(q.getAll("resource")).toEqual(["a", "b"]);
    expect(q.has("x")).toBe(false);
  });
});

describe("consent helpers", () => {
  it("splits scopes and describes them in plain words", () => {
    expect(splitScopes("openid  prompts:write ")).toEqual(["openid", "prompts:write"]);
    expect(splitScopes(undefined)).toEqual([]);
    expect(describeScope("prompts:write")).toMatch(/rate prompts and save/i);
    expect(describeScope("something:else")).toBe("something:else");
  });

  it("shows only the host of the redirect URI", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHost("http://127.0.0.1:5173/callback")).toBe("127.0.0.1:5173");
    expect(redirectHost("not a url")).toBeNull();
    expect(redirectHost(undefined)).toBeNull();
  });
});
