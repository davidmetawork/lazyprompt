// Shared helpers for the MCP integration tests: JSON-RPC calls against the exported route handlers.
import { vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { getBaseUrl } from "@/lib/base-url";
import { POST } from "@/app/mcp/route";

export const base = () => getBaseUrl();

export function setMcpEnv(vars: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  resetEnvCache();
}

export function unsetMcpEnv(): void {
  vi.unstubAllEnvs();
  resetEnvCache();
}

let rpcId = 0;

export interface RpcResult {
  status: number;
  headers: Headers;
  /** Parsed JSON-RPC response (null for an empty body). */
  json: { id?: unknown; result?: Record<string, unknown> & { isError?: boolean; structuredContent?: Record<string, unknown>; content?: { type: string; text: string }[]; _meta?: Record<string, unknown> }; error?: { code: number; message: string } } | null;
  text: string;
}

export function mcpRequest(body: unknown, headers: Record<string, string> = {}, init: { method?: string } = {}): Request {
  return new Request(`${base()}/mcp`, {
    method: init.method ?? "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function parse(res: Response): Promise<RpcResult> {
  const text = await res.text();
  let json: RpcResult["json"] = null;
  const ct = res.headers.get("content-type") ?? "";
  try {
    if (ct.includes("text/event-stream")) {
      const data = text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter(Boolean);
      json = data.length ? JSON.parse(data[data.length - 1]!) : null;
    } else if (text) {
      json = JSON.parse(text);
    }
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

export async function rpc(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}): Promise<RpcResult> {
  const res = await POST(mcpRequest({ jsonrpc: "2.0", id: ++rpcId, method, params }, headers));
  return parse(res);
}

export async function callTool(name: string, args: Record<string, unknown> = {}, headers: Record<string, string> = {}, meta?: Record<string, unknown>): Promise<RpcResult> {
  return rpc("tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) }, headers);
}

export async function rawPost(body: string, headers: Record<string, string> = {}): Promise<RpcResult> {
  return parse(await POST(mcpRequest(body, headers)));
}

export async function initialize(headers: Record<string, string> = {}): Promise<RpcResult> {
  return rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "vitest", version: "1.0.0" },
  }, headers);
}
