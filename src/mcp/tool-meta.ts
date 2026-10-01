// Pure helpers shared by the tool registrations and the unit tests (no server-only imports).
import { parseShortIdFromSlug } from "@/lib/slug";
import { WRITE_SCOPE } from "./config";
import { WIDGET_VERSION } from "./widget-html.generated";

/** The version query busts host caches whenever the widget bundle changes. */
export const WIDGET_URI = `ui://lazyprompt/prompt-widget.html?v=${WIDGET_VERSION}`;

export type ToolSecurity = "noauth" | "oauth";

/** `_meta` shared by every tool. Security schemes live ONLY here (ToolConfig has no top-level field). */
export function toolMeta(opts: {
  invoking: string; invoked: string; security: ToolSecurity; widget?: "display"; widgetAccessible?: boolean;
}): Record<string, unknown> {
  if (opts.invoking.length > 64 || opts.invoked.length > 64) throw new Error("tool invocation strings must be <= 64 chars");
  const meta: Record<string, unknown> = {
    "openai/toolInvocation/invoking": opts.invoking,
    "openai/toolInvocation/invoked": opts.invoked,
    securitySchemes: opts.security === "oauth" ? [{ type: "oauth2", scopes: [WRITE_SCOPE] }] : [{ type: "noauth" }],
  };
  if (opts.widget === "display") meta.ui = { resourceUri: WIDGET_URI, ...(opts.widgetAccessible ? { visibility: ["model", "app"] } : {}) };
  else if (opts.widgetAccessible) meta.ui = { visibility: ["model", "app"] };
  if (opts.widgetAccessible) meta["openai/widgetAccessible"] = true;
  return meta;
}

export const READ_ANNOTATIONS = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true } as const;

/** Accepts a shortId, a full slug, or a /p/<slug> URL. */
export function parsePromptRef(raw: string): string | null {
  let ref = raw.trim();
  try {
    if (/^https?:\/\//i.test(ref)) ref = new URL(ref).pathname;
  } catch {
    return null;
  }
  ref = ref.split(/[?#]/)[0] ?? "";
  ref = ref.replace(/\/+$/, "").split("/").pop() ?? "";
  if (/^[0-9a-z]{7}$/.test(ref)) return ref;
  return parseShortIdFromSlug(ref.toLowerCase());
}

