import type { VariableDef } from "../types";
import { MAX_TEMPLATE_KEYS } from "../constants";

export interface TemplateError {
  kind: "malformed" | "unused_declared" | "select_without_options" | "too_many" | "conflict";
  key?: string;
  message: string;
}
export interface ParsedVariable {
  key: string;
  type?: VariableDef["type"];
  options?: string[];
  default?: string;
  occurrences: number;
}
export interface TemplateToken {
  start: number;
  end: number;
  raw: string;
  key: string;
  type?: VariableDef["type"];
  options?: string[];
  default?: string;
}

/** Section 6 grammar: {{ key (":" type)? ("|" default)? }}; `\{{` is an escape. */
export const TOKEN_SOURCE =
  String.raw`(?<!\\)\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]{0,39})\s*(?::\s*(text|long|number|select\(([^)]*)\)))?\s*(?:\|([^}]*))?\}\}`;
const MALFORMED_SOURCE = String.raw`(?<!\\)\{\{[^{}]*\}\}`;

export function labelFromKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function splitOptions(raw: string): string[] {
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

/** All well-formed tokens, in order, with their source offsets. */
export function scanTokens(body: string): TemplateToken[] {
  const re = new RegExp(TOKEN_SOURCE, "g");
  const out: TemplateToken[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const typeRaw = m[2];
    let type: VariableDef["type"] | undefined;
    let options: string[] | undefined;
    if (typeRaw) {
      if (typeRaw.startsWith("select")) {
        type = "select";
        options = splitOptions(m[3] ?? "");
      } else {
        type = typeRaw as VariableDef["type"];
      }
    }
    const def = m[4] !== undefined ? m[4].trim() : undefined;
    const tok: TemplateToken = { start: m.index, end: m.index + m[0].length, raw: m[0], key: m[1]! };
    if (type) tok.type = type;
    if (options) tok.options = options;
    if (def !== undefined && def !== "") tok.default = def;
    out.push(tok);
  }
  return out;
}

/** `{{...}}` spans that look like placeholders but do not match the grammar. */
function findMalformed(body: string): string[] {
  const good = new Set(scanTokens(body).map((t) => t.start));
  const re = new RegExp(MALFORMED_SOURCE, "g");
  const bad: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (!good.has(m.index)) bad.push(m[0]);
  }
  return bad;
}

function sameOptions(a?: string[], b?: string[]): boolean {
  if (!a && !b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => x === b[i]);
}

export function parseTemplate(body: string): { variables: ParsedVariable[]; errors: TemplateError[] } {
  const errors: TemplateError[] = [];
  const byKey = new Map<string, ParsedVariable>();
  const order: string[] = [];

  for (const tok of scanTokens(body)) {
    const existing = byKey.get(tok.key);
    if (!existing) {
      const v: ParsedVariable = { key: tok.key, occurrences: 1 };
      if (tok.type) v.type = tok.type;
      if (tok.options) v.options = tok.options;
      if (tok.default !== undefined) v.default = tok.default;
      byKey.set(tok.key, v);
      order.push(tok.key);
      continue;
    }
    existing.occurrences += 1;
    // First occurrence wins; report later conflicting specs.
    const conflicting =
      (tok.type !== undefined && tok.type !== existing.type) ||
      (tok.default !== undefined && tok.default !== existing.default) ||
      (tok.options !== undefined && !sameOptions(tok.options, existing.options));
    if (conflicting) {
      errors.push({ kind: "conflict", key: tok.key,
        message: `Variable "${tok.key}" is specified more than once with different settings; the first one is used.` });
    }
  }

  for (const raw of findMalformed(body)) {
    errors.push({ kind: "malformed", message: `Could not read the placeholder ${raw}; it will be shown as plain text.` });
  }

  const variables = order.map((k) => byKey.get(k)!);
  for (const v of variables) {
    if (v.type === "select" && (!v.options || v.options.length < 2)) {
      errors.push({ kind: "select_without_options", key: v.key,
        message: `Variable "${v.key}" is a select but has fewer than 2 options.` });
    }
  }
  if (variables.length > MAX_TEMPLATE_KEYS) {
    errors.push({ kind: "too_many", message: `A prompt can have at most ${MAX_TEMPLATE_KEYS} different variables.` });
  }
  return { variables, errors };
}
