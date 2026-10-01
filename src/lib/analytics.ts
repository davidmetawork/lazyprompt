import { track } from "@vercel/analytics";

export type AnalyticsEvent =
  | "prompt_copy" | "prompt_open" | "prompt_feedback" | "prompt_save" | "prompt_rate"
  | "comment_post" | "prompt_submit" | "search" | "sign_in_start";

/** Wraps @vercel/analytics track(); silently no-ops on any failure. Callers must never pass PII or query text. */
export function trackEvent(name: AnalyticsEvent, props?: Record<string, string | number | boolean | null>): void {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the UI */
  }
}
