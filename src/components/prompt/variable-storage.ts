"use client";

import type { VariableDef } from "@/lib/types";

const MAX_VALUE_LENGTH = 4000;

export const variablesStorageKey = (shortId: string) => `lp:vars:${shortId}`;

/** Reads saved values for a prompt. Only known keys with string values survive; any failure gives {}. */
export function loadVariableValues(shortId: string, variables: Pick<VariableDef, "key">[]): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(variablesStorageKey(shortId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const known = new Set(variables.map((v) => v.key));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (known.has(k) && typeof v === "string") out[k] = v.slice(0, MAX_VALUE_LENGTH);
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
