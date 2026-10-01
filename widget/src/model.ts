// Pure view-model helpers (no DOM, no host bridge) so they can be unit tested.
import { MODEL_TARGETS } from "../../src/lib/models";
import type { ListState, PromptData, SearchResult, ToolResult, View } from "./types";

/** Friendly model name for a badge ("chatgpt" -> "ChatGPT"). Unknown ids fall back to a humanized id. */
export function modelLabel(id: string): string {
  const target = Object.hasOwn(MODEL_TARGETS, id) ? MODEL_TARGETS[id as keyof typeof MODEL_TARGETS] : undefined;
  if (target) return target.name;
  return id.replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export function textOf(result: ToolResult): string {
  return (result.content ?? []).filter((c) => c.type === "text" && c.text).map((c) => c.text).join("\n").trim();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function asStringMap(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v)) if (typeof val === "string") out[k] = val;
  return out;
}

export type Interpreted =
  | { kind: "view"; view: View }
  | { kind: "open-prompt"; id: string; initialValues: Record<string, string> };

/**
 * Decides what a tool result should show.
 * - search_prompts (`results`) -> list
 * - get_prompt (`prompt`) -> card
 * - render_prompt (`text` + `complete`) -> load the prompt, then show the card pre-filled with the call's values
 * - anything else (errors, categories) -> a plain message
 */
export function interpretResult(result: ToolResult, args: Record<string, unknown> | undefined): Interpreted {
  if (result.isError) return { kind: "view", view: { kind: "message", text: textOf(result) || "Something went wrong.", tone: "error" } };
  const sc = result.structuredContent;
  if (sc && Array.isArray(sc.results)) {
    const list: ListState = {
      query: typeof sc.query === "string" ? sc.query : null,
      total: typeof sc.total === "number" ? sc.total : sc.results.length,
      results: sc.results as SearchResult[],
    };
    return { kind: "view", view: { kind: "list", list } };
  }
  if (sc && isRecord(sc.prompt)) {
    return { kind: "view", view: { kind: "card", prompt: sc.prompt as unknown as PromptData, initialValues: {}, back: null } };
  }
  if (sc && typeof sc.text === "string" && typeof sc.id === "string" && "complete" in sc) {
    return { kind: "open-prompt", id: sc.id, initialValues: asStringMap(args?.values) };
  }
  return { kind: "view", view: { kind: "message", text: textOf(result) || "Nothing to show.", tone: "info" } };
}

export function ratingLabel(rating: number | null, count: number): string {
  if (rating === null || count === 0) return "Not rated yet";
  return `Rated ${rating} out of 5 by ${count} ${count === 1 ? "person" : "people"}`;
}

export function siteOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Link used for Rate/Save fallbacks when the write tools are unavailable or the user is signed out. */
export function siteFallbackUrl(promptUrl: string, action: "rate" | "save"): string {
  return action === "rate" ? `${promptUrl}#rate` : promptUrl;
}

export function needsSignIn(result: ToolResult): boolean {
  const challenge = result._meta?.["mcp/www_authenticate"];
  return result.isError === true && Array.isArray(challenge) && challenge.length > 0;
}
