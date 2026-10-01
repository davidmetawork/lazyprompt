/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write. All assert admin.role === "admin", write moderation_actions, keep counters right.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { TrustLevel, Viewer } from "@/lib/types";

export async function moderatePrompt(
  admin: Viewer,
  promptId: string,
  action: "approve" | "reject" | "hide" | "restore" | "remove" | "feature" | "unfeature",
  reason?: string,
): Promise<void> {
  return notImplemented("moderatePrompt");
}
export async function moderateComment(
  admin: Viewer,
  commentId: string,
  action: "approve" | "hide" | "restore" | "remove",
  reason?: string,
): Promise<void> {
  return notImplemented("moderateComment");
}
export async function resolveReport(
  admin: Viewer,
  reportId: string,
  resolution: "actioned" | "dismissed",
  note?: string,
): Promise<void> {
  return notImplemented("resolveReport");
}
/** Updates user.banned*, deletes sessions; FORBIDDEN if userId === admin.id (enforced here, not only in the UI). */
export async function setUserBan(admin: Viewer, userId: string, input: { banned: boolean; reason?: string }): Promise<void> {
  return notImplemented("setUserBan");
}
export async function setTrustLevel(admin: Viewer, userId: string, level: TrustLevel): Promise<void> {
  return notImplemented("setTrustLevel");
}
