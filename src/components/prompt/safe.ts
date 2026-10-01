import "server-only";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { maybeRecomputeRankings } from "@/server/ranking/recompute";

/**
 * Runs a read that may not be implemented yet (or may fail) and returns null instead of throwing.
 * Next.js control-flow errors (notFound, redirect, dynamic bailouts) are always rethrown.
 */
export async function safely<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e);
    return null;
  }
}

/** Schedules the throttled ranking recompute after the response is sent. Never surfaces failures. */
export function scheduleRankingRecompute(): void {
  after(async () => {
    try {
      await maybeRecomputeRankings();
    } catch {
      /* rankings are best effort */
    }
  });
}
