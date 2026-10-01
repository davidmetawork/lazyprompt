import "server-only";
import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { ZodError } from "zod";
import { getViewerById } from "@/auth/viewer";
import { AppError } from "@/lib/errors";
import { getPromptByShortId } from "@/server/prompts/queries";
import { clientIp } from "@/server/rate-limit";
import type { PromptDetail, Viewer } from "@/lib/types";
import { WRITE_SCOPE, wwwAuthenticateValue } from "../config";
import { parsePromptRef } from "../tool-meta";
export { READ_ANNOTATIONS, toolMeta, type ToolSecurity } from "../tool-meta";

export interface McpToolOptions { oauthEnabled: boolean; baseUrl: string }

export function okResult(text: string, structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent };
}

export function errorResult(text: string, meta?: Record<string, unknown>): CallToolResult {
  return { isError: true, content: [{ type: "text", text }], ...(meta ? { _meta: meta } : {}) };
}

/** Maps thrown errors to a readable tool error. Never includes input values, tokens or stack traces. */
export function errorFrom(e: unknown, toolName: string): CallToolResult {
  if (e instanceof AppError) {
    if (e.code === "NOT_FOUND") return errorResult(e.message || "Not found.");
    if (e.code === "VALIDATION") return errorResult(`Invalid input: ${e.message}`);
    if (e.code === "RATE_LIMITED") return errorResult(e.message);
    if (e.code === "BANNED" || e.code === "FORBIDDEN") return errorResult("Your LazyPrompt account cannot do this.");
    if (e.code === "UNAUTHENTICATED") return errorResult("Sign in to LazyPrompt to do this.");
    return errorResult(e.message || "Something went wrong.");
  }
  if (e instanceof ZodError) return errorResult(`Invalid input: ${e.issues.map((i) => i.message).join("; ")}`);
  console.error(`[mcp] ${toolName} failed:`, e instanceof Error ? e.name : "unknown error");
  return errorResult("Something went wrong on LazyPrompt. Please try again.");
}

export async function findPublishedPrompt(id: string): Promise<PromptDetail | null> {
  const shortId = parsePromptRef(id);
  if (!shortId) return null;
  return getPromptByShortId(shortId);
}

export const PROMPT_NOT_FOUND = "No published prompt matches that id. Use search_prompts to find a prompt id.";

export function requestIp(ctx: ServerContext): string | null {
  const headers = ctx.http?.req?.headers;
  return headers ? clientIp(headers) : null;
}

export function requestUserAgent(ctx: ServerContext): string | null {
  return ctx.http?.req?.headers.get("user-agent") ?? null;
}

/**
 * Resolves the signed-in LazyPrompt user for a write tool. With no verified token it returns the in-result
 * challenge ChatGPT understands (`_meta["mcp/www_authenticate"]`). Role and ban state always come from the DB.
 */
export async function requireWriteViewer(
  ctx: ServerContext,
  baseUrl: string,
): Promise<{ viewer: Viewer } | { result: CallToolResult }> {
  const authInfo = ctx.http?.authInfo;
  const userId = authInfo?.extra?.userId;
  if (!authInfo || typeof userId !== "string" || !authInfo.scopes.includes(WRITE_SCOPE)) {
    return {
      result: errorResult("Sign in to LazyPrompt to do this, then try again.", {
        "mcp/www_authenticate": [wwwAuthenticateValue(baseUrl)],
      }),
    };
  }
  const viewer = await getViewerById(userId);
  if (!viewer) return { result: errorResult("Sign in to LazyPrompt to do this, then try again.", { "mcp/www_authenticate": [wwwAuthenticateValue(baseUrl)] }) };
  if (viewer.banned) return { result: errorResult("Your LazyPrompt account cannot do this.") };
  return { viewer };
}
