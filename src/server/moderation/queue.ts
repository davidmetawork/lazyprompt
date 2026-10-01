/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write. Every function must assert admin.role === "admin" first, else AppError FORBIDDEN.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type {
  AdminStats, AdminUserRow, ModerationLogItem, ModerationQueueItem, Paginated, PromptCard, PromptStatus,
  ReportItem, ReportStatus, Viewer,
} from "@/lib/types";

export async function getModerationQueue(
  admin: Viewer,
  input: { kind: "prompt" | "comment"; page?: number },
): Promise<Paginated<ModerationQueueItem>> {
  return notImplemented("getModerationQueue");
}
export async function listReports(
  admin: Viewer,
  input: { status?: ReportStatus; page?: number },
): Promise<Paginated<ReportItem>> {
  return notImplemented("listReports");
}
export async function getAdminStats(admin: Viewer): Promise<AdminStats> {
  return notImplemented("getAdminStats");
}
export async function listModerationLog(admin: Viewer, page?: number): Promise<Paginated<ModerationLogItem>> {
  return notImplemented("listModerationLog");
}
export async function listAdminUsers(
  admin: Viewer,
  input: { q?: string; page?: number },
): Promise<Paginated<AdminUserRow>> {
  return notImplemented("listAdminUsers");
}
export async function listAdminPrompts(
  admin: Viewer,
  input: { q?: string; status?: PromptStatus; page?: number },
): Promise<Paginated<PromptCard & { status: PromptStatus; moderationFlags: string[] }>> {
  return notImplemented("listAdminPrompts");
}
