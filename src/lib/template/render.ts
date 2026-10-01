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
 * Fills `{{key}}` placeholders. Inserted values are never re-parsed. `\{{` renders as a literal `{{`.
 * `unfilled`: "label" -> [Label] (default), "keep" -> {{key}}, "empty" -> "".
 */
export function renderTemplate(
  body: string,
  defs: VariableDef[],
  values: Record<string, string>,
  opts: { unfilled?: "label" | "keep" | "empty" } = {},
): { text: string; missing: string[]; segments: RenderSegment[] } {
  const unfilled = opts.unfilled ?? "label";
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
    const raw = values[tok.key];
    const label = def?.label ?? labelFromKey(tok.key);
    let value: string | undefined;
    if (raw !== undefined && raw.trim() !== "") value = raw;
    else if (def?.default !== undefined && def.default !== "") value = def.default;
    else if (tok.default !== undefined) value = tok.default;

    if (value !== undefined) {
      segments.push({ kind: "var", text: value, key: tok.key, filled: true });
    } else {
      const isRequired = def ? def.required : true;
      if (isRequired && !missing.includes(tok.key)) missing.push(tok.key);
      const text = unfilled === "label" ? `[${label}]` : unfilled === "keep" ? `{{${tok.key}}}` : "";
      segments.push({ kind: "var", text, key: tok.key, filled: false });
    }
  }
  pushText(unescape(body.slice(cursor)));
  return { text: segments.map((s) => s.text).join(""), missing, segments };
}
