// Pure MCP constants and helpers (no server-only imports, so unit tests and the widget docs can reuse them).
// ARCHITECTURE.md section 12.

export const PROTECTED_TOOLS: ReadonlySet<string> = new Set(["rate_prompt", "save_prompt"]);
export const WRITE_SCOPE = "prompts:write";
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_SUBJECT_LENGTH = 128;
export const MAX_EXAMPLE_OUTPUT = 1500;

export type ChallengeSetting = "auto" | "http401" | "result";
export type ChallengeMode = "http401" | "result";

/** `auto` answers ChatGPT (User-Agent contains openai/chatgpt) in-result and everyone else with an HTTP 401. */
export function selectChallengeMode(setting: ChallengeSetting, userAgent: string | null | undefined): ChallengeMode {
  if (setting === "http401" || setting === "result") return setting;
  return /openai|chatgpt/i.test(userAgent ?? "") ? "result" : "http401";
}

/** The in-result challenge value ChatGPT reads from `_meta["mcp/www_authenticate"]`. */
export function wwwAuthenticateValue(baseUrl: string): string {
  return `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to LazyPrompt"`;
}

export interface PeekedRequest {
  /** JSON-RPC method of the (first) message, when the body parsed. */
  method?: string;
  /** `params.name` of a tools/call. */
  toolName?: string;
  /** `params._meta["openai/subject"]`, used for rate limiting only (never authorization). */
  subject?: string;
  /** True when ANY message in the body is a tools/call for a tool in PROTECTED_TOOLS. */
  protectedCall: boolean;
  id?: string | number | null;
}

function peekOne(msg: unknown): Omit<PeekedRequest, "protectedCall"> & { protectedCall: boolean } {
  const out: PeekedRequest = { protectedCall: false };
  if (!msg || typeof msg !== "object") return out;
  const m = msg as { method?: unknown; id?: unknown; params?: unknown };
  if (typeof m.method === "string") out.method = m.method;
  if (typeof m.id === "string" || typeof m.id === "number" || m.id === null) out.id = m.id;
  const params = m.params && typeof m.params === "object" ? (m.params as { name?: unknown; _meta?: unknown }) : undefined;
  if (typeof params?.name === "string") out.toolName = params.name;
  const meta = params?._meta && typeof params._meta === "object" ? (params._meta as Record<string, unknown>) : undefined;
  const subject = meta?.["openai/subject"];
  if (typeof subject === "string" && subject.length > 0) out.subject = subject.slice(0, MAX_SUBJECT_LENGTH);
  out.protectedCall = out.method === "tools/call" && out.toolName !== undefined && PROTECTED_TOOLS.has(out.toolName);
  return out;
}

/** Summarizes a parsed JSON-RPC body (single message or batch). */
export function peekBody(body: unknown): PeekedRequest {
  if (Array.isArray(body)) {
    const parts = body.map(peekOne);
    const first = parts[0] ?? { protectedCall: false };
    return { ...first, subject: parts.find((p) => p.subject)?.subject, protectedCall: parts.some((p) => p.protectedCall) };
  }
  return peekOne(body);
}
