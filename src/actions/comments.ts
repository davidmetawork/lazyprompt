"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewerForAction } from "@/auth/viewer";
import { isSafeSlug } from "@/components/community/helpers";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, CommentNode } from "@/lib/types";
import { commentInputSchema, type CommentInput } from "@/lib/validation";
import { createComment, deleteComment, updateComment } from "@/server/comments";

function refresh(slug: string): void {
  if (isSafeSlug(slug)) revalidatePath(`/p/${slug}`);
  revalidatePath("/me/prompts");
}

/** `parentId` may only point at a top-level comment; the server layer enforces the one-level depth rule. */
export async function createCommentAction(input: CommentInput & { slug: string }): Promise<ActionResult<CommentNode>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    const parsed = commentInputSchema.parse({ promptId: input.promptId, parentId: input.parentId, body: input.body });
    return createComment(v, parsed);
  });
  if (r.ok) refresh(input.slug);
  return r;
}

export async function updateCommentAction(
  input: { commentId: string; body: string; slug: string },
): Promise<ActionResult<CommentNode>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    const commentId = z.uuid().parse(input.commentId);
    const body = commentInputSchema.shape.body.parse(input.body);
    return updateComment(v, commentId, body);
  });
  if (r.ok) refresh(input.slug);
  return r;
}

export async function deleteCommentAction(input: { commentId: string; slug: string }): Promise<ActionResult<{ ok: true }>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    await deleteComment(v, z.uuid().parse(input.commentId));
    return { ok: true as const };
  });
  if (r.ok) refresh(input.slug);
  return r;
}
