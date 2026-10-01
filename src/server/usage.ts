/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-read.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { AiModel, EventSource, UsageEventType } from "@/lib/types";

export interface UsageEventRecord {
  promptId: string; type: UsageEventType; model?: AiModel | null; source: EventSource;
  userId?: string | null; ip?: string | null; userAgent?: string | null;
}

export async function recordUsageEvent(input: UsageEventRecord): Promise<{ counted: boolean }> {
  return notImplemented("recordUsageEvent");
}
export function hashActor(input: { userId?: string | null; ip?: string | null; userAgent?: string | null }): string {
  return notImplemented("hashActor");
}
