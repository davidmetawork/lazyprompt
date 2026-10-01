/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { RatingSummary, Viewer } from "@/lib/types";

export async function ratePrompt(actor: Viewer, promptId: string, stars: number): Promise<RatingSummary> {
  return notImplemented("ratePrompt");
}
export async function removeRating(actor: Viewer, promptId: string): Promise<RatingSummary> {
  return notImplemented("removeRating");
}
