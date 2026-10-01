import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canSendMagicLink, sendMagicLink } from "@/auth/email";

const KEYS = ["VERCEL_ENV", "NODE_ENV", "RESEND_API_KEY", "MAGIC_LINK_DEV_SINK"] as const;
const saved: Record<string, string | undefined> = {};

describe("sendMagicLink without RESEND_API_KEY", () => {
  beforeEach(() => {
    for (const k of KEYS) { saved[k] = process.env[k]; if (k !== "NODE_ENV") delete process.env[k]; }
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const k of KEYS) { if (k !== "NODE_ENV") { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
    vi.restoreAllMocks();
  });

  it("throws on Vercel production", async () => {
    process.env.VERCEL_ENV = "production";
    await expect(sendMagicLink({ email: "a@b.co", url: "https://x/y" })).rejects.toThrow("Sign-in email is not configured");
  });

  it("throws on a production build with no dev sink", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(sendMagicLink({ email: "a@b.co", url: "https://x/y" })).rejects.toThrow("Sign-in email is not configured");
  });

  it("logs the link outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await expect(sendMagicLink({ email: "a@b.co", url: "https://x/y" })).resolves.toBeUndefined();
    expect(console.info).toHaveBeenCalled();
  });

  it("reports whether a sign-in link can be delivered", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(canSendMagicLink()).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(canSendMagicLink()).toBe(false);
    process.env.RESEND_API_KEY = "re_test";
    expect(canSendMagicLink()).toBe(true);
    delete process.env.RESEND_API_KEY;
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "production");
    expect(canSendMagicLink()).toBe(false);
    process.env.MAGIC_LINK_DEV_SINK = ".data/links.jsonl";
    expect(canSendMagicLink()).toBe(true);
  });
});
