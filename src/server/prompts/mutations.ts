/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write (replace every notImplemented).
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { PromptInput, PromptUpdateInput } from "@/lib/validation";
import type { PromptStatus, Viewer } from "@/lib/types";

export async function createPrompt(
  actor: Viewer,
  input: PromptInput,
): Promise<{ id: string; shortId: string; slug: string; status: PromptStatus }> {
  return notImplemented("createPrompt");
}
export async function updatePrompt(
  actor: Viewer,
  promptId: string,
  input: PromptUpdateInput,
): Promise<{ slug: string; version: number; status: PromptStatus }> {
  return notImplemented("updatePrompt");
}
export async function deletePrompt(actor: Viewer, promptId: string): Promise<void> {
  return notImplemented("deletePrompt");
}
