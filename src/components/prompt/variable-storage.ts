"use client";

import type { VariableDef } from "@/lib/types";

const MAX_VALUE_LENGTH = 4000;

export const variablesStorageKey = (shortId: string) => `lp:vars:${shortId}`;

/** Reads saved values for a prompt. Only known keys with string values survive; any failure gives {}. */
export function loadVariableValues(shortId: string, variables: Pick<VariableDef, "key" | "type" | "options">[]): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(variablesStorageKey(shortId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const byKey = new Map(variables.map((v) => [v.key, v]));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const def = byKey.get(k);
      if (!def || typeof v !== "string") continue;
      if (def.type === "select" && !(def.options ?? []).includes(v)) continue;   // option was removed since it was saved
      if (def.type === "number" && v.trim() !== "" && !Number.isFinite(Number(v))) continue;
      out[k] = v.slice(0, MAX_VALUE_LENGTH);
    }
    return out;
  } catch {
    return {};
  }
}

/** Saves non-empty values; removes the entry when nothing is left. Never throws. */
export function saveVariableValues(shortId: string, values: Record<string, string>): void {
  try {
    const entries = Object.entries(values).filter(([, v]) => v !== "");
    if (entries.length === 0) window.localStorage.removeItem(variablesStorageKey(shortId));
    else window.localStorage.setItem(variablesStorageKey(shortId), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage can be blocked or full */
  }
}
