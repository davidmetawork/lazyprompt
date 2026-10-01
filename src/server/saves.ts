/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { Paginated, PromptCard, Viewer } from "@/lib/types";

export async function setSaved(actor: Viewer, promptId: string, saved: boolean): Promise<{ saved: boolean; saveCount: number }> {
  return notImplemented("setSaved");
}
export async function listSavedPrompts(userId: string, page?: number): Promise<Paginated<PromptCard>> {
  return notImplemented("listSavedPrompts");
}
