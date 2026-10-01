/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { CommentInput } from "@/lib/validation";
import type { CommentNode, Viewer } from "@/lib/types";

export async function listComments(promptId: string, viewer: Viewer | null): Promise<CommentNode[]> {
  return notImplemented("listComments");
}
export async function createComment(actor: Viewer, input: CommentInput): Promise<CommentNode> {
  return notImplemented("createComment");
}
export async function updateComment(actor: Viewer, commentId: string, body: string): Promise<CommentNode> {
  return notImplemented("updateComment");
}
export async function deleteComment(actor: Viewer, commentId: string): Promise<void> {
  return notImplemented("deleteComment");
}
