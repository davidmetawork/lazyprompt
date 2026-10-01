import { track } from "@vercel/analytics";

/** Wraps @vercel/analytics track(); silently no-ops on any failure. No PII, no query text. */
export function trackEvent(name: string, props?: Record<string, string | number | boolean | null>): void {
  try {
    track(name, props);
  } catch {
    /* analytics must never break the UI */
  }
}
