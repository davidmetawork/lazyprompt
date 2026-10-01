import type { VariableDef } from "../../src/lib/types";

export type { VariableDef };

/** structuredContent.results[] from search_prompts. */
export interface SearchResult {
  id: string; title: string; description: string; category: string; tags: string[]; models: string[];
  rating: number | null; ratingCount: number; copies: number; variableCount: number; url: string;
}

/** structuredContent.prompt from get_prompt. */
export interface PromptData {
  id: string; title: string; description: string; body: string; variables: VariableDef[];
  exampleOutput: string | null; exampleOutputTruncated: boolean; notes: string | null;
  category: { slug: string; name: string }; tags: string[]; models: string[];
  rating: number | null; ratingCount: number; author: { name: string; username: string };
  license: string; url: string;
}

export interface ListState { query: string | null; total: number; results: SearchResult[] }

export type View =
  | { kind: "loading"; label: string }
  | { kind: "message"; text: string; tone: "info" | "error" }
  | { kind: "list"; list: ListState }
  | { kind: "card"; prompt: PromptData; initialValues: Record<string, string>; back: ListState | null };

/** Minimal shape of an MCP CallToolResult as seen by the widget. */
export interface ToolResult {
  isError?: boolean;
  content?: { type: string; text?: string }[];
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}
