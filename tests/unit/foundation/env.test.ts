import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv, rateLimitsRelaxedForE2e, resetEnvCache } from "@/lib/env";
import { absoluteUrl, getBaseUrl } from "@/lib/base-url";

// A (nearly) empty environment: only PATH so the tsx shim can find node.
const EMPTY_ENV = { PATH: process.env.PATH ?? "" } as unknown as NodeJS.ProcessEnv;

describe("env.ts is lazy", () => {
  it("importing src/lib/env.ts with an EMPTY environment does not throw (separate process)", () => {
    const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
    const out = execFileSync(tsx, ["-e", "import('./src/lib/env').then(m => console.log(typeof m.env))"], {
      env: EMPTY_ENV, encoding: "utf8", cwd: process.cwd(),
    });
    expect(out.trim()).toBe("object");
  });

  it("touching a property without DATABASE_URL throws naming the variable (separate process)", () => {
    const tsx = resolve(process.cwd(), "node_modules/.bin/tsx");
    expect(() => execFileSync(tsx, ["-e", "import('./src/lib/env').then(m => m.env.DATABASE_URL)"], {
      env: EMPTY_ENV, encoding: "utf8", cwd: process.cwd(), stdio: "pipe",
    })).toThrow(/DATABASE_URL/);
  });
});

describe("parseEnv", () => {
  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); resetEnvCache(); });
  afterEach(() => vi.restoreAllMocks());

  it("requires DATABASE_URL always", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });
  it("falls back to dev secrets locally", () => {
    const e = parseEnv({ DATABASE_URL: "postgres://x/y" });
    expect(e.BETTER_AUTH_SECRET).toMatch(/^dev-insecure-/);
    expect(e.IP_HASH_SALT).toMatch(/^dev-insecure-/);
  });
  it("requires secrets on Vercel production and preview", () => {
    for (const VERCEL_ENV of ["production", "preview"]) {
      expect(() => parseEnv({ DATABASE_URL: "postgres://x/y", VERCEL_ENV })).toThrow(/BETTER_AUTH_SECRET, IP_HASH_SALT/);
    }
    const ok = parseEnv({ DATABASE_URL: "postgres://x/y", VERCEL_ENV: "production", BETTER_AUTH_SECRET: "s", IP_HASH_SALT: "t" });
    expect(ok.BETTER_AUTH_SECRET).toBe("s");
  });
  it("parses booleans, numbers and enums with defaults", () => {
    const e = parseEnv({ DATABASE_URL: "postgres://x/y", MCP_OAUTH_ENABLED: "true", SEO_NOINDEX: "false", REPORT_AUTOHIDE_THRESHOLD: "5" });
    expect(e.MCP_OAUTH_ENABLED).toBe(true);
    expect(e.SEO_NOINDEX).toBe(false);
    expect(e.REPORT_AUTOHIDE_THRESHOLD).toBe(5);
    expect(e.MCP_AUTH_CHALLENGE).toBe("auto");
    expect(() => parseEnv({ DATABASE_URL: "postgres://x/y", MCP_AUTH_CHALLENGE: "weird" })).toThrow();
  });
  it("is strict for production builds outside CI, lenient in CI", () => {
    const base = { DATABASE_URL: "postgres://x/y", NODE_ENV: "production" };
    expect(() => parseEnv(base)).toThrow(/BETTER_AUTH_SECRET, IP_HASH_SALT/);
    expect(() => parseEnv({ ...base, CI: "true" })).not.toThrow();
  });
  it("treats empty optional numeric/enum values as unset", () => {
    const e = parseEnv({ DATABASE_URL: "postgres://x/y", REPORT_AUTOHIDE_THRESHOLD: "", MCP_AUTH_CHALLENGE: "" });
    expect(e.REPORT_AUTOHIDE_THRESHOLD).toBe(3);
    expect(e.MCP_AUTH_CHALLENGE).toBe("auto");
  });
  it("treats empty strings as unset", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://x/y", RESEND_API_KEY: "" }).RESEND_API_KEY).toBeUndefined();
  });
});

describe("getBaseUrl", () => {
  const KEYS = ["BETTER_AUTH_URL", "VERCEL_ENV", "NEXT_PUBLIC_SITE_URL", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL", "PORT"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => { for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; } });
  afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

  it("defaults to localhost:3000 and honors PORT", () => {
    expect(getBaseUrl()).toBe("http://localhost:3000");
    process.env.PORT = "3555";
    expect(getBaseUrl()).toBe("http://localhost:3555");
  });
  it("BETTER_AUTH_URL wins and loses its trailing slash", () => {
    process.env.BETTER_AUTH_URL = "https://tunnel.example/";
    process.env.VERCEL_URL = "ignored.vercel.app";
    expect(getBaseUrl()).toBe("https://tunnel.example");
  });
  it("production prefers NEXT_PUBLIC_SITE_URL, then the project production URL", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "lazyprompt.vercel.app";
    expect(getBaseUrl()).toBe("https://lazyprompt.vercel.app");
    process.env.NEXT_PUBLIC_SITE_URL = "https://lazyprompt.ai";
    expect(getBaseUrl()).toBe("https://lazyprompt.ai");
  });
  it("preview uses the stable branch URL, then the deployment URL", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "dep-123.vercel.app";
    expect(getBaseUrl()).toBe("https://dep-123.vercel.app");
    process.env.VERCEL_BRANCH_URL = "branch.vercel.app";
    expect(getBaseUrl()).toBe("https://branch.vercel.app");
  });
  it("absoluteUrl joins paths", () => {
    expect(absoluteUrl("/p/x")).toBe("http://localhost:3000/p/x");
    expect(absoluteUrl("p/x")).toBe("http://localhost:3000/p/x");
  });
});

describe("rateLimitsRelaxedForE2e", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off unless E2E_DISABLE_RATE_LIMITS is exactly true", () => {
    vi.stubEnv("E2E_DISABLE_RATE_LIMITS", "");
    expect(rateLimitsRelaxedForE2e()).toBe(false);
    vi.stubEnv("E2E_DISABLE_RATE_LIMITS", "1");
    expect(rateLimitsRelaxedForE2e()).toBe(false);
    vi.stubEnv("E2E_DISABLE_RATE_LIMITS", "true");
    expect(rateLimitsRelaxedForE2e()).toBe(true);
  });

  it("can never be enabled on a Vercel runtime (production or preview)", () => {
    vi.stubEnv("E2E_DISABLE_RATE_LIMITS", "true");
    vi.stubEnv("VERCEL", "1");
    expect(rateLimitsRelaxedForE2e()).toBe(false);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(rateLimitsRelaxedForE2e()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(rateLimitsRelaxedForE2e()).toBe(false);
  });
});
