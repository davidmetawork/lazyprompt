"use client";

import { trackEvent } from "@/lib/analytics";
import type { AiModel, UsageEventType } from "@/lib/types";

export interface UsageEventBody { promptId: string; type: UsageEventType; model?: AiModel }
export interface UsageMeta { category?: string; filled?: boolean; prefilled?: boolean }

/** Fire-and-forget first-party event (never carries variable values) plus the matching analytics event. */
export function sendUsageEvent(body: UsageEventBody, meta: UsageMeta = {}): void {
  const payload = JSON.stringify(body);
  try {
    let sent = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      sent = navigator.sendBeacon("/api/events", new Blob([payload], { type: "application/json" }));
    }
    if (!sent && typeof fetch === "function") {
      void fetch("/api/events", {
        method: "POST", headers: { "content-type": "application/json" }, body: payload, keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    /* usage events must never break the UI */
  }

  if (body.type === "copy") trackEvent("prompt_copy", { category: meta.category ?? null, filled: meta.filled ?? false });
  else if (body.type === "open") trackEvent("prompt_open", { model: body.model ?? null, prefilled: meta.prefilled ?? false });
  else if (body.type === "worked" || body.type === "not_worked") trackEvent("prompt_feedback", { worked: body.type === "worked" });
}
