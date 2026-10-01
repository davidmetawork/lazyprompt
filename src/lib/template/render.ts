import type { VariableDef } from "../types";
import { MAX_TEMPLATE_KEYS } from "../constants";
import { TOKEN_SOURCE, labelFromKey, parseTemplate, scanTokens, type TemplateError } from "./parse";

export interface RenderSegment { kind: "text" | "var"; text: string; key?: string; filled?: boolean }

const ESCAPE = "\\{{";

function unescape(text: string): string {
  return text.split(ESCAPE).join("{{");
}

/**
 * Rewrites every token to canonical `{{key}}` and merges inline specs into VariableDefs.
 * A declared def wins over the inline spec. Stored bodies are always canonical.
 */
export function normalizeTemplate(
  body: string,
  declared: VariableDef[] = [],
): { body: string; variables: VariableDef[]; errors: TemplateError[] } {
  const parsed = parseTemplate(body);
  const errors: TemplateError[] = [...parsed.errors];
  const declaredByKey = new Map(declared.map((d) => [d.key, d]));
  const variables: VariableDef[] = [];

  for (const pv of parsed.variables) {
    const d = declaredByKey.get(pv.key);
    if (d) {
      const merged: VariableDef = { ...d, label: d.label || labelFromKey(d.key) };
      if (merged.type === "select" && (!merged.options || merged.options.length < 2)) {
        // A declared select without options may borrow inline options.
        if (pv.options && pv.options.length >= 2) merged.options = pv.options;
      }
      variables.push(merged);
      continue;
    }
    const type = pv.type ?? "text";
    const def: VariableDef = {
      key: pv.key,
      label: labelFromKey(pv.key),
      type,
      required: pv.default === undefined,
    };
    if (type === "select" && pv.options) def.options = pv.options;
    if (pv.default !== undefined) def.default = pv.default;
    variables.push(def);
  }

  const used = new Set(parsed.variables.map((v) => v.key));
  for (const d of declared) {
    if (!used.has(d.key)) {
      errors.push({ kind: "unused_declared", key: d.key, message: `Variable "${d.key}" is declared but not used in the prompt body.` });
    }
  }
  for (const v of variables) {
    if (v.type === "select" && (!v.options || v.options.length < 2)) {
      if (!errors.some((e) => e.kind === "select_without_options" && e.key === v.key)) {
        errors.push({ kind: "select_without_options", key: v.key, message: `Variable "${v.key}" is a select but has fewer than 2 options.` });
      }
    }
  }
  if (variables.length > MAX_TEMPLATE_KEYS && !errors.some((e) => e.kind === "too_many")) {
    errors.push({ kind: "too_many", message: `A prompt can have at most ${MAX_TEMPLATE_KEYS} different variables.` });
  }

  const re = new RegExp(TOKEN_SOURCE, "g");
  const canonical = body.replace(re, (_m, key: string) => `{{${key}}}`);
  return { body: canonical, variables, errors };
}

/**
 * Drops lines that only became blank because an optional variable on them rendered as "". Lines the author left blank
 * on purpose (no emptied variable on them) are kept.
 */
function collapseEmptiedLines(segments: RenderSegment[], emptied: ReadonlySet<RenderSegment>): RenderSegment[] {
  const lines: RenderSegment[][] = [[]];
  for (const seg of segments) {
    if (seg.kind === "text") {
      seg.text.split("\n").forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1]!.push({ kind: "text", text: part });
      });
    } else {
      lines[lines.length - 1]!.push(seg);
    }
  }
  const kept = lines.filter((line) => {
    if (!line.some((s) => emptied.has(s))) return true;
    return !line.every((s) => emptied.has(s) || (s.kind === "text" && s.text.trim() === ""));
  });
  const out: RenderSegment[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.kind === "text") last.text += t;
    else out.push({ kind: "text", text: t });
  };
  kept.forEach((line, i) => {
    if (i > 0) pushText("\n");
    for (const s of line) {
      if (s.kind === "text") pushText(s.text);
      else out.push(s);
    }
  });
  return out;
}

/**
 * Fills `{{key}}` placeholders. Inserted values are never re-parsed. `\{{` renders as a literal `{{`.
 * `unfilled`: "label" -> [Label] (default), "keep" -> {{key}}, "empty" -> "".
 * `placeholders`: "bracket" (default) leaves unfilled variables as `unfilled` says. "empty" renders unfilled OPTIONAL
 * variables as "" (and drops lines that become blank because of it), so copied or sent text never carries "[Label]" for
 * something the user chose to skip. Unfilled required variables still follow `unfilled`.
 * Only own keys of `values` count: a variable named `constructor` or `__proto__` never reads Object.prototype.
 */
export function renderTemplate(
  body: string,
  defs: VariableDef[],
  values: Record<string, string>,
  opts: { unfilled?: "label" | "keep" | "empty"; placeholders?: "bracket" | "empty" } = {},
): { text: string; missing: string[]; segments: RenderSegment[] } {
  const unfilled = opts.unfilled ?? "label";
  const emptyOptional = opts.placeholders === "empty";
  const emptied = new Set<RenderSegment>();
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const segments: RenderSegment[] = [];
  const missing: string[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = segments[segments.length - 1];
    if (last && last.kind === "text") last.text += t;
    else segments.push({ kind: "text", text: t });
  };

  let cursor = 0;
  for (const tok of scanTokens(body)) {
    pushText(unescape(body.slice(cursor, tok.start)));
    cursor = tok.end;
    const def = defByKey.get(tok.key);
    const raw = Object.hasOwn(values, tok.key) ? values[tok.key] : undefined;
    const label = def?.label ?? labelFromKey(tok.key);
    let value: string | undefined;
    if (typeof raw === "string" && raw.trim() !== "") value = raw;
    else if (def?.default !== undefined && def.default !== "") value = def.default;
    else if (tok.default !== undefined) value = tok.default;

    if (value !== undefined) {
      segments.push({ kind: "var", text: value, key: tok.key, filled: true });
    } else {
      const isRequired = def ? def.required : true;
      if (isRequired && !missing.includes(tok.key)) missing.push(tok.key);
      const dropped = emptyOptional && !isRequired;
      const text = dropped ? "" : unfilled === "label" ? `[${label}]` : unfilled === "keep" ? `{{${tok.key}}}` : "";
      const seg: RenderSegment = { kind: "var", text, key: tok.key, filled: false };
      if (dropped) emptied.add(seg);
      segments.push(seg);
    }
  }
  pushText(unescape(body.slice(cursor)));
  const final = emptied.size > 0 ? collapseEmptiedLines(segments, emptied) : segments;
  return { text: final.map((s) => s.text).join(""), missing, segments: final };
}
