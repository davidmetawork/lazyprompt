import { z } from "zod";
import {
  AI_MODELS, USE_CASES, VARIABLE_TYPES, LICENSES, SORT_KEYS, REPORT_TARGETS, REPORT_REASONS, USAGE_EVENT_TYPES,
  MAX_PAGE, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE,
} from "./constants";
import { normalizeTag } from "./slug";

const RESERVED_VARIABLE_KEYS = new Set([
  "constructor", "prototype", "__proto__", "toString", "valueOf", "hasOwnProperty",
  "isPrototypeOf", "propertyIsEnumerable", "toLocaleString",
]);

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const variableDefSchema = z.object({
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$/, "Invalid variable key"),
  label: trimmed(1, 60),
  type: z.enum(VARIABLE_TYPES),
  options: z.array(trimmed(1, 60)).min(2).max(20).optional(),
  default: z.string().max(500).optional(),
  required: z.boolean(),
  help: z.string().max(200).optional(),
}).superRefine((v, ctx) => {
  if (RESERVED_VARIABLE_KEYS.has(v.key)) {
    ctx.addIssue({ code: "custom", path: ["key"], message: "That variable name is reserved" });
  }
  if (v.type === "select" && (!v.options || v.options.length < 2)) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Select variables need 2-20 options" });
  }
});

const tagSchema = z.string().transform((s, ctx) => {
  const n = normalizeTag(s);
  if (!n) {
    ctx.addIssue({ code: "custom", message: "Tags must be 2-32 letters, numbers or dashes" });
    return z.NEVER;
  }
  return n;
});

export const promptInputSchema = z.object({
  title: trimmed(8, 100),
  description: trimmed(20, 300),
  body: z.string().trim().min(40).max(8000),
  variables: z.array(variableDefSchema).max(20).default([]),
  exampleOutput: z.string().trim().max(6000).optional(),
  notes: z.string().trim().max(2000).optional(),
  categorySlug: z.string().min(1).max(48),
  useCase: z.enum(USE_CASES),
  tags: z.array(tagSchema).min(1).max(5),
  models: z.array(z.enum(AI_MODELS)).max(6).default([]),
  license: z.enum(LICENSES).default("cc_by_4"),
  forkedFromShortId: z.string().min(1).max(12).optional(),
});

export const promptUpdateInputSchema = promptInputSchema.omit({ forkedFromShortId: true }).extend({
  changeNote: z.string().trim().max(200).optional(),
});

export const listPromptsInputSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.string().max(48).optional(),
  tag: z.string().max(32).optional(),
  model: z.enum(AI_MODELS).optional(),
  useCase: z.enum(USE_CASES).optional(),
  sort: z.enum(SORT_KEYS).optional(),
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  authorId: z.string().optional(),
});

export const commentInputSchema = z.object({
  promptId: z.uuid(),
  parentId: z.uuid().optional(),
  body: trimmed(1, 2000),
});

export const ratingInputSchema = z.object({
  promptId: z.uuid(),
  stars: z.number().int().min(1).max(5),
});

export const reportInputSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(100),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export const profileInputSchema = z.object({
  username: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,29}$/, "3-30 characters: a-z, 0-9, _ or -"),
  bio: z.string().trim().max(280).optional(),
  website: z.url({ protocol: /^https$/, error: "Enter an https:// URL" }).max(200).optional()
    .or(z.literal("").transform(() => undefined)),
});

export const usageEventInputSchema = z.object({
  promptId: z.uuid(),
  type: z.enum(USAGE_EVENT_TYPES),
  model: z.enum(AI_MODELS).optional(),
});

/**
 * Returns a same-site absolute path (path + query + hash) for `raw` of at most 512 chars, else "/".
 * Rejects control characters, whitespace and backslashes anywhere (browsers strip tabs/newlines, so "/\t/evil.com"
 * would become "//evil.com"), then requires the URL parser to keep the origin unchanged.
 */
export function safeNext(raw: string | null | undefined): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return "/";
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  try {
    const u = new URL(raw, "http://x");
    if (u.origin !== "http://x") return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

export type VariableDefInput = z.infer<typeof variableDefSchema>;
export type PromptInput = z.infer<typeof promptInputSchema>;
export type PromptUpdateInput = z.infer<typeof promptUpdateInputSchema>;
// z.input so callers may omit page/pageSize (defaults applied by the schema).
export type ListPromptsInput = z.input<typeof listPromptsInputSchema>;
export type CommentInput = z.infer<typeof commentInputSchema>;
export type RatingInput = z.infer<typeof ratingInputSchema>;
export type ReportInput = z.infer<typeof reportInputSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
export type UsageEventInput = z.infer<typeof usageEventInputSchema>;
