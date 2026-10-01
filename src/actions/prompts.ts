"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewerForAction } from "@/auth/viewer";
import { isSafeSlug, promptFormDataToInput } from "@/components/community/helpers";
import { AppError, toActionResult } from "@/lib/errors";
import type { ActionResult, PromptStatus } from "@/lib/types";
import { promptInputSchema, promptUpdateInputSchema } from "@/lib/validation";
import { createPrompt, deletePrompt, updatePrompt } from "@/server/prompts/mutations";

export type PromptActionState = ActionResult<{ slug: string; status: PromptStatus }> | null;

function afterSaveHref(slug: string, status: PromptStatus): string {
  return status === "published" ? `/p/${slug}` : "/me/prompts?submitted=1";
}

function revalidatePromptPaths(username: string, slugs: string[]): void {
  revalidatePath("/");
  revalidatePath("/prompts");
  revalidatePath("/me/prompts");
  revalidatePath(`/u/${username}`);
  for (const s of new Set(slugs)) {
    revalidatePath(`/p/${s}`);
    revalidatePath(`/p/${s}/versions`);
  }
}

export async function createPromptAction(_prev: PromptActionState, formData: FormData): Promise<PromptActionState> {
  let username = "";
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    username = v.username;
    const input = promptInputSchema.parse(promptFormDataToInput(formData));
    const created = await createPrompt(v, input);
    return { slug: created.slug, status: created.status };
  });
  if (!r.ok) return r;
  revalidatePromptPaths(username, [r.data.slug]);
  redirect(afterSaveHref(r.data.slug, r.data.status));
}

export async function updatePromptAction(_prev: PromptActionState, formData: FormData): Promise<PromptActionState> {
  let username = "";
  const oldSlug = formData.get("slug");
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    username = v.username;
    const promptId = z.uuid().safeParse(formData.get("promptId"));
    if (!promptId.success) throw new AppError("NOT_FOUND", "Prompt not found");
    const input = promptUpdateInputSchema.parse(promptFormDataToInput(formData));
    return updatePrompt(v, promptId.data, input);
  });
  if (!r.ok) return r;
  revalidatePromptPaths(username, [r.data.slug, ...(isSafeSlug(oldSlug) ? [oldSlug] : [])]);
  redirect(afterSaveHref(r.data.slug, r.data.status));
}

export async function deletePromptAction(input: { promptId: string; slug: string }): Promise<ActionResult<{ ok: true }>> {
  let username = "";
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    username = v.username;
    const promptId = z.uuid().parse(input.promptId);
    await deletePrompt(v, promptId);
    return { ok: true as const };
  });
  if (!r.ok) return r;
  revalidatePromptPaths(username, isSafeSlug(input.slug) ? [input.slug] : []);
  redirect("/me/prompts");
}
