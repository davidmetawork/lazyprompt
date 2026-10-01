/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { ScreeningResult, TrustLevel } from "@/lib/types";

export interface ScreenInput {
  kind: "prompt" | "comment"; title?: string; text: string;
  author: { trustLevel: TrustLevel; accountAgeDays: number }; excludePromptId?: string;
}

/** Pure, sync. */
export function runHeuristics(input: ScreenInput): ScreeningResult {
  return notImplemented("runHeuristics");
}
/** Heuristics + duplicate (prompts) + OpenAI moderation if a key is set. */
export async function screenContent(input: ScreenInput): Promise<ScreeningResult> {
  return notImplemented("screenContent");
}
