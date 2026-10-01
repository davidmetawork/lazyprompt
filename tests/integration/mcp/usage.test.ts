import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/db";
import { createPrompt, createUser } from "../../helpers/factories";
import { resetDb } from "../../helpers/db";
import { callTool, unsetMcpEnv } from "./helpers";

// data-read owns recordUsageEvent; mocked so the wiring is tested independently of the package merge order.
const recordUsageEvent = vi.fn();
vi.mock("@/server/usage", () => ({ recordUsageEvent: (...a: unknown[]) => recordUsageEvent(...a), hashActor: vi.fn() }));

afterAll(async () => { await closeDb(); });

let shortId: string;
let promptId: string;

beforeAll(async () => {
  await resetDb();
  const author = await createUser();
  const p = await createPrompt(author, { title: "Usage tracked prompt" });
  shortId = p.shortId;
  promptId = p.id;
});
beforeEach(() => { recordUsageEvent.mockReset(); recordUsageEvent.mockResolvedValue({ counted: true }); unsetMcpEnv(); });

describe("usage events", () => {
  it("render_prompt records a render event with source mcp, the client IP and user agent", async () => {
    await callTool("render_prompt", { id: shortId, values: { topic: "tide pools" } }, { "x-real-ip": "203.0.113.20", "user-agent": "openai-mcp/1.0" });
    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith({
      promptId, type: "render", model: null, source: "mcp", userId: null, ip: "203.0.113.20", userAgent: "openai-mcp/1.0",
    });
  });

  it("search_prompts, get_prompt and list_categories record nothing", async () => {
    await callTool("search_prompts", { query: "usage" });
    await callTool("get_prompt", { id: shortId });
    await callTool("list_categories");
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });

  it("a failing usage event never breaks the render and variable values are never logged", async () => {
    recordUsageEvent.mockRejectedValue(new Error("db down: secret-value-123"));
    const spies = (["log", "warn", "error", "info"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const res = await callTool("render_prompt", { id: shortId, values: { topic: "secret-value-123" } });
    expect(res.json?.result?.isError).toBeFalsy();
    expect((res.json?.result?.structuredContent as { text: string }).text).toContain("secret-value-123");
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("secret-value-123");
    spies.forEach((s) => s.mockRestore());
  });

  it("unknown prompts are an isError result and record nothing", async () => {
    const res = await callTool("render_prompt", { id: "zzzzzzz", values: {} });
    expect(res.json?.result?.isError).toBe(true);
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });
});
