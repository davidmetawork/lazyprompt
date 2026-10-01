// Pure helpers shared by the community components, pages and actions. No React, no server-only imports.
import { AI_MODELS, REPORT_REASONS, USE_CASES } from "@/lib/constants";
import { labelFromKey, normalizeTemplate, type TemplateError } from "@/lib/template";
import type { CommentNode, RatingSummary, VariableDef } from "@/lib/types";
import { safeNext } from "@/lib/validation";

export const COMMENT_MAX = 2000;
export const REPORT_DETAILS_MAX = 1000;
export const COMMENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_TAGS = 5;
export const MAX_MODELS = 6;

/** `/sign-in?next=<encoded path>`; the path is validated with safeNext so it can never be an open redirect. */
export function signInHref(path: string): string {
  return `/sign-in?next=${encodeURIComponent(safeNext(path))}`;
}

export const USE_CASE_LABELS: Record<(typeof USE_CASES)[number], string> = Object.fromEntries(
  USE_CASES.map((u) => [u, labelFromKey(u)]),
) as Record<(typeof USE_CASES)[number], string>;

export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  spam: "Spam or advertising",
  broken: "Broken or does not work",
  jailbreak: "Jailbreak or harmful instructions",
  nsfw: "Sexual or NSFW content",
  harassment: "Harassment or hate",
  copyright: "Copyright or takedown request",
  personal_data: "Contains personal data",
  other: "Something else",
};

export const AI_MODEL_SET: ReadonlySet<string> = new Set(AI_MODELS);

// ---- ratings -------------------------------------------------------------------------------------------------

/** Optimistic summary after the viewer sets (`stars`) or clears (`null`) their rating. */
export function applyRating(s: RatingSummary, stars: number | null): RatingSummary {
  const sum = (s.ratingAvg ?? 0) * s.ratingCount;
  const without = s.viewerRating !== null ? sum - s.viewerRating : sum;
  const count = s.viewerRating !== null ? s.ratingCount - 1 : s.ratingCount;
  if (stars === null) {
    return { ratingAvg: count > 0 ? without / count : null, ratingCount: count, viewerRating: null };
  }
  const nextCount = count + 1;
  return { ratingAvg: (without + stars) / nextCount, ratingCount: nextCount, viewerRating: stars };
}

// ---- comments ------------------------------------------------------------------------------------------------

export function relativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.round(d / 365);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

/** True while an own comment may still be edited (24 hours after creation). */
export function editWindowOpen(createdAtIso: string, now: number = Date.now()): boolean {
  const t = Date.parse(createdAtIso);
  return !Number.isNaN(t) && now - t < COMMENT_EDIT_WINDOW_MS;
}

export interface CommentView extends Omit<CommentNode, "replies"> {
  timeLabel: string;
  canEdit: boolean;
  replies: CommentView[];
}

export function toCommentView(node: CommentNode, now: number = Date.now()): CommentView {
  return {
    ...node,
    timeLabel: relativeTime(node.createdAt, now),
    canEdit: node.isOwn && (node.status === "visible" || node.status === "pending") && editWindowOpen(node.createdAt, now),
    replies: node.replies.map((r) => toCommentView(r, now)),
  };
}

// ---- prompt form: variables ----------------------------------------------------------------------------------

/** What the author edited in a variable row. Anything undefined falls back to what was detected in the body. */
export interface VariableOverride {
  label?: string;
  type?: VariableDef["type"];
  optionsText?: string;
  default?: string;
  required?: boolean;
  help?: string;
}

export function splitOptions(text: string): string[] {
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

export function overridesFromDefs(defs: VariableDef[]): Record<string, VariableOverride> {
  const out: Record<string, VariableOverride> = {};
  for (const d of defs) {
    out[d.key] = {
      label: d.label, type: d.type, optionsText: (d.options ?? []).join(", "),
      default: d.default ?? "", required: d.required, help: d.help ?? "",
    };
  }
  return out;
}

export interface BuiltVariables {
  /** Body with every token rewritten to canonical `{{key}}`. */
  body: string;
  /** Detected variables merged with the author's edits, ready for the `variables` field. */
  variables: VariableDef[];
  errors: TemplateError[];
}

/** Detects `{{variables}}` (including inline `:type` / `|default` shorthand) and merges the author's row edits. */
export function buildVariables(body: string, overrides: Record<string, VariableOverride>): BuiltVariables {
  const detected = normalizeTemplate(body, []);
  const merged: VariableDef[] = detected.variables.map((v) => {
    const o = overrides[v.key];
    if (!o) return v;
    const type = o.type ?? v.type;
    const rawLabel = o.label ?? v.label;
    const label = rawLabel.trim() === "" ? labelFromKey(v.key) : rawLabel;
    const def = o.default !== undefined ? o.default : v.default;
    const help = o.help !== undefined ? o.help : v.help;
    const out: VariableDef = {
      key: v.key,
      label,
      type,
      required: o.required ?? (def ? false : v.required),
    };
    if (type === "select") {
      const options = o.optionsText !== undefined ? splitOptions(o.optionsText) : v.options;
      if (options && options.length > 0) out.options = options;
    }
    if (def) out.default = def;
    if (help) out.help = help;
    return out;
  });
  const final = normalizeTemplate(body, merged);
  return { body: final.body, variables: final.variables, errors: final.errors };
}

// ---- prompt form: FormData <-> input -------------------------------------------------------------------------

export interface PromptFormValues {
  title: string;
  description: string;
  body: string;
  categorySlug: string;
  useCase: (typeof USE_CASES)[number];
  tags: string[];
  models: (typeof AI_MODELS)[number][];
  license: "cc0" | "cc_by_4";
  exampleOutput: string;
  notes: string;
  changeNote: string;
  variables: VariableDef[];
  forkedFromShortId?: string;
}

function jsonField(fd: FormData, name: string): unknown {
  const raw = fd.get(name);
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function textField(fd: FormData, name: string): string | undefined {
  const v = fd.get(name);
  if (typeof v !== "string") return undefined;
  return v;
}

function optionalText(fd: FormData, name: string): string | undefined {
  const v = textField(fd, name);
  return v === undefined || v.trim() === "" ? undefined : v;
}

/**
 * Turns the prompt form's FormData into the raw object the zod schemas validate. Never throws: malformed JSON
 * becomes a value the schema rejects, so the author sees a normal VALIDATION result.
 */
export function promptFormDataToInput(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: textField(fd, "title") ?? "",
    description: textField(fd, "description") ?? "",
    body: textField(fd, "body") ?? "",
    categorySlug: textField(fd, "categorySlug") ?? "",
    useCase: textField(fd, "useCase") ?? "",
    tags: jsonField(fd, "tags") ?? [],
    models: jsonField(fd, "models") ?? [],
    variables: jsonField(fd, "variables") ?? [],
    license: textField(fd, "license") || "cc_by_4",
    exampleOutput: optionalText(fd, "exampleOutput"),
    notes: optionalText(fd, "notes"),
  };
  const forked = optionalText(fd, "forkedFromShortId");
  if (forked) out.forkedFromShortId = forked;
  const change = optionalText(fd, "changeNote");
  if (change) out.changeNote = change;
  return out;
}

export function promptValuesToFormData(v: PromptFormValues, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("title", v.title);
  fd.set("description", v.description);
  fd.set("body", v.body);
  fd.set("categorySlug", v.categorySlug);
  fd.set("useCase", v.useCase);
  fd.set("tags", JSON.stringify(v.tags));
  fd.set("models", JSON.stringify(v.models));
  fd.set("variables", JSON.stringify(v.variables));
  fd.set("license", v.license);
  fd.set("exampleOutput", v.exampleOutput);
  fd.set("notes", v.notes);
  fd.set("changeNote", v.changeNote);
  if (v.forkedFromShortId) fd.set("forkedFromShortId", v.forkedFromShortId);
  for (const [k, val] of Object.entries(extra)) fd.set(k, val);
  return fd;
}

/** Slugs are interpolated into revalidatePath(); accept only the shape buildPromptSlug produces. */
export function isSafeSlug(slug: unknown): slug is string {
  return typeof slug === "string" && /^[a-z0-9][a-z0-9-]{0,200}$/.test(slug);
}

/** Field errors for a form field: exact key plus nested keys such as `tags.0`. */
export function fieldMessages(fieldErrors: Record<string, string[]> | undefined, name: string): string[] {
  if (!fieldErrors) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(fieldErrors)) {
    if (k === name || k.startsWith(`${name}.`)) out.push(...v);
  }
  return out;
}

// ---- friendlier zod messages ---------------------------------------------------------------------------------

/** Rewrites zod's default length messages into plain language; anything else is returned unchanged. */
export function friendlyMessage(msg: string): string {
  let m = /^Too small: expected string to have >=(\d+) characters?/.exec(msg);
  if (m) return m[1] === "1" ? "Choose an option" : `Use at least ${m[1]} characters`;
  m = /^Too big: expected string to have <=(\d+) characters?/.exec(msg);
  if (m) return `Use at most ${m[1]} characters`;
  m = /^Too small: expected array to have >=(\d+) items?/.exec(msg);
  if (m) return `Add at least ${m[1]}`;
  m = /^Too big: expected array to have <=(\d+) items?/.exec(msg);
  if (m) return `Add at most ${m[1]}`;
  if (/^Invalid input: expected string, received undefined/.test(msg) || /^Invalid option/.test(msg)) return "Choose an option";
  return msg;
}

export function friendlyFieldErrors(fe: Record<string, string[]> | undefined): Record<string, string[]> | undefined {
  if (!fe) return fe;
  return Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v.map(friendlyMessage)]));
}
