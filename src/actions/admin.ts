"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminForAction } from "@/auth/viewer";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { moderateComment, moderatePrompt, resolveReport, setTrustLevel, setUserBan } from "@/server/moderation/actions";

const id = z.string().trim().min(1).max(64);
const slug = z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/, "Invalid slug").optional();
const reason = z.string().trim().max(500).optional().transform((v) => v || undefined);
const requiredReason = z.string().trim().min(3, "Please give a reason (at least 3 characters)").max(500);

function revalidate(promptSlug?: string) {
  revalidatePath("/admin", "layout");
  if (promptSlug) revalidatePath(`/p/${promptSlug}`);
}

const promptActionSchema = z.object({
  promptId: id,
  slug,
  action: z.enum(["approve", "reject", "hide", "restore", "remove", "feature", "unfeature"]),
  reason,
}).superRefine((v, ctx) => {
  if (v.action === "reject" && !(v.reason && v.reason.length >= 3)) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required to reject a prompt" });
  }
});

export async function moderatePromptAction(input: z.input<typeof promptActionSchema>): Promise<ActionResult> {
  let promptSlug: string | undefined;
  const r = await toActionResult(async () => {
    const admin = await requireAdminForAction();
    const v = promptActionSchema.parse(input);
    promptSlug = v.slug;
    await moderatePrompt(admin, v.promptId, v.action, v.reason);
  });
  if (r.ok) revalidate(promptSlug);
  return r;
}

const commentActionSchema = z.object({
  commentId: id,
  slug,
  action: z.enum(["approve", "hide", "restore", "remove"]),
  reason,
});

export async function moderateCommentAction(input: z.input<typeof commentActionSchema>): Promise<ActionResult> {
  let promptSlug: string | undefined;
  const r = await toActionResult(async () => {
    const admin = await requireAdminForAction();
    const v = commentActionSchema.parse(input);
    promptSlug = v.slug;
    await moderateComment(admin, v.commentId, v.action, v.reason);
  });
  if (r.ok) revalidate(promptSlug);
  return r;
}

const resolveSchema = z.discriminatedUnion("resolution", [
  z.object({
    resolution: z.literal("dismissed"),
    reportId: id,
    note: reason,
    slug,
  }),
  z.object({
    resolution: z.literal("actioned"),
    reportId: id,
    note: reason,
    slug,
    /** What to do to the reported content before resolving. "none" is used for user reports (handled on /admin/users). */
    targetType: z.enum(["prompt", "comment", "user"]),
    targetId: id,
    targetAction: z.enum(["hide", "remove", "none"]),
  }),
]);

export async function resolveReportAction(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  let promptSlug: string | undefined;
  const r = await toActionResult(async () => {
    const admin = await requireAdminForAction();
    const v = resolveSchema.parse(input);
    promptSlug = v.slug;
    if (v.resolution === "actioned" && v.targetAction !== "none") {
      if (v.targetType === "prompt") await moderatePrompt(admin, v.targetId, v.targetAction, v.note);
      else if (v.targetType === "comment") await moderateComment(admin, v.targetId, v.targetAction, v.note);
    }
    await resolveReport(admin, v.reportId, v.resolution, v.note);
  });
  if (r.ok) revalidate(promptSlug);
  return r;
}

const banSchema = z.discriminatedUnion("banned", [
  z.object({ userId: id, banned: z.literal(true), reason: requiredReason }),
  z.object({ userId: id, banned: z.literal(false), reason }),
]);

export async function setUserBanAction(input: z.input<typeof banSchema>): Promise<ActionResult> {
  const r = await toActionResult(async () => {
    const admin = await requireAdminForAction();
    const v = banSchema.parse(input);
    await setUserBan(admin, v.userId, { banned: v.banned, reason: v.reason });
  });
  if (r.ok) revalidate();
  return r;
}

const trustSchema = z.object({ userId: id, level: z.union([z.literal(0), z.literal(1), z.literal(2)]) });

export async function setTrustLevelAction(input: z.input<typeof trustSchema>): Promise<ActionResult> {
  const r = await toActionResult(async () => {
    const admin = await requireAdminForAction();
    const v = trustSchema.parse(input);
    await setTrustLevel(admin, v.userId, v.level);
  });
  if (r.ok) revalidate();
  return r;
}
