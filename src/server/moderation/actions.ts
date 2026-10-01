import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { comments, moderationActions, profiles, promptVersions, prompts, reports, session, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { PromptStatus, ReportTarget, TrustLevel, Viewer } from "@/lib/types";
import { recountOpenReports, recountPromptComments, recountPromptRelations } from "./counters";
import { parseInput, requireActiveAdmin } from "./guards";
import { recomputeTrustLevel } from "@/server/users";

const reasonSchema = z.string().trim().max(500).optional();
const uuidSchema = z.uuid();

type Mod = Pick<Viewer, "id">;

async function logAction(
  tx: Tx,
  admin: Mod,
  e: { targetType: ReportTarget; targetId: string; action: (typeof moderationActions.$inferInsert)["action"]; reason?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(moderationActions).values({
    actorId: admin.id, targetType: e.targetType, targetId: e.targetId, action: e.action,
    reason: e.reason || null, metadata: e.metadata ?? {},
  });
}

/**
 * Approving or restoring content is the admin's verdict that the open reports against it do not hold: dismiss them in the
 * same transaction (otherwise the next distinct reporter would instantly re-hide it) and recount open_report_count.
 */
async function dismissOpenReports(tx: Tx, admin: Mod, targetType: "prompt" | "comment", targetId: string, why: string): Promise<number> {
  const closed = await tx.update(reports).set({
    status: "dismissed", resolvedById: admin.id, resolvedAt: new Date(), resolutionNote: why,
  }).where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")))
    .returning({ id: reports.id });
  await recountOpenReports(tx, targetType, targetId);
  return closed.length;
}

type PromptAction = "approve" | "reject" | "hide" | "restore" | "remove" | "feature" | "unfeature";

const TARGET_STATUS: Partial<Record<PromptAction, PromptStatus>> = {
  approve: "published", reject: "rejected", hide: "hidden", restore: "published", remove: "removed",
};

/**
 * approve (-> published, published_at set once, author trust recomputed), reject (stores the reason as the
 * moderation note), hide, restore (hidden/removed -> published), remove, feature, unfeature. Counters
 * (category, tag, author, fork counts) are recounted and one moderation_actions row is written per action.
 * Repeating an action that already holds is a no-op.
 */
export async function moderatePrompt(admin: Viewer, promptId: string, action: PromptAction, reason?: string): Promise<void> {
  const me = await requireActiveAdmin(admin);
  const id = parseInput(uuidSchema, promptId);
  const note = parseInput(reasonSchema, reason);

  const authorId = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(prompts).where(eq(prompts.id, id)).for("update").limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Prompt not found");

    if (action === "feature" || action === "unfeature") {
      const want = action === "feature";
      if (want && p.status !== "published") throw new AppError("CONFLICT", "Only published prompts can be featured");
      if (p.isFeatured === want) return null;
      await tx.update(prompts).set({ isFeatured: want }).where(eq(prompts.id, id));
      await logAction(tx, me, { targetType: "prompt", targetId: id, action, reason: note });
      return null;
    }

    const to = TARGET_STATUS[action]!;
    if (p.status === to) {
      if (action === "hide" && p.autoHiddenAt) {
        // An admin confirming an automatic hide makes it a manual one, so a later dismissal does not un-hide it.
        await tx.update(prompts).set({ autoHiddenAt: null, reviewedById: me.id, reviewedAt: new Date() }).where(eq(prompts.id, id));
        await logAction(tx, me, { targetType: "prompt", targetId: id, action, reason: note, metadata: { from: p.status, to, confirmedAutoHide: true } });
      }
      return null;
    }
    if (p.status === "removed" && action !== "restore") throw new AppError("CONFLICT", "This prompt was removed; restore it first");
    if (action === "hide" && p.status !== "published" && p.status !== "pending") {
      throw new AppError("CONFLICT", `Can't hide a ${p.status} prompt`);
    }
    if (action === "restore" && p.status !== "hidden" && p.status !== "removed") {
      throw new AppError("CONFLICT", `Can't restore a ${p.status} prompt`);
    }

    const now = new Date();
    await tx.update(prompts).set({
      status: to,
      reviewedById: me.id,
      reviewedAt: now,
      ...(to === "published"
        ? { publishedAt: p.publishedAt ?? now, autoHiddenAt: null, removedAt: null, approvedFromVersion: p.approvedFromVersion ?? p.version }
        : {}),
      ...(to === "removed" ? { removedAt: now, isFeatured: false } : {}),
      ...(to !== "published" && to !== "removed" ? { isFeatured: false } : {}),
      moderationNote: action === "approve" || action === "restore" ? null : note ?? p.moderationNote,
    }).where(eq(prompts.id, id));
    await recountPromptRelations(tx, { promptId: id, categoryIds: [p.categoryId], authorId: p.authorId, forkedFromId: p.forkedFromId });
    const dismissed = to === "published"
      ? await dismissOpenReports(tx, me, "prompt", id, `Dismissed: prompt was ${action === "approve" ? "approved" : "restored"}`)
      : 0;
    await logAction(tx, me, {
      targetType: "prompt", targetId: id, action, reason: note,
      metadata: { from: p.status, to, ...(dismissed ? { dismissedReports: dismissed } : {}) },
    });
    return action === "approve" ? p.authorId : null;
  });

  if (authorId) await recomputeTrustLevel(authorId);
}

export const REDACTED_TEXT = "[redacted]";

/**
 * Admin redaction of one historical version: its text fields become "[redacted]" (the version row, number and
 * author stay so the history is still contiguous) and a moderation_actions row records it (action `remove` on the
 * prompt with metadata.via = "redact_version", since the mod_action enum has no dedicated value). The CURRENT version
 * cannot be redacted: edit or remove the prompt instead. Repeating it is a no-op.
 */
export async function moderatePromptVersion(admin: Viewer, promptId: string, version: number, reason: string): Promise<void> {
  const me = await requireActiveAdmin(admin);
  const id = parseInput(uuidSchema, promptId);
  const v = parseInput(z.number().int().min(1).max(1_000_000), version);
  const why = parseInput(z.string().trim().min(3, "Please give a reason (at least 3 characters)").max(500), reason);

  await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: prompts.id, version: prompts.version }).from(prompts).where(eq(prompts.id, id)).for("update").limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Prompt not found");
    if (v === p.version) throw new AppError("CONFLICT", "That is the current version; edit or remove the prompt instead");
    const [row] = await tx.select({ id: promptVersions.id, body: promptVersions.body }).from(promptVersions)
      .where(and(eq(promptVersions.promptId, id), eq(promptVersions.version, v))).for("update").limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Version not found");
    if (row.body === REDACTED_TEXT) return;
    await tx.update(promptVersions).set({
      title: REDACTED_TEXT, description: REDACTED_TEXT, body: REDACTED_TEXT, variables: [],
      exampleOutput: REDACTED_TEXT, notes: REDACTED_TEXT, changeNote: REDACTED_TEXT,
    }).where(eq(promptVersions.id, row.id));
    await logAction(tx, me, { targetType: "prompt", targetId: id, action: "remove", reason: why, metadata: { via: "redact_version", version: v } });
  });
}

const COMMENT_TARGET: Record<"approve" | "hide" | "restore" | "remove", "visible" | "hidden" | "removed"> = {
  approve: "visible", hide: "hidden", restore: "visible", remove: "removed",
};

export async function moderateComment(
  admin: Viewer,
  commentId: string,
  action: "approve" | "hide" | "restore" | "remove",
  reason?: string,
): Promise<void> {
  const me = await requireActiveAdmin(admin);
  const id = parseInput(uuidSchema, commentId);
  const note = parseInput(reasonSchema, reason);
  const to = COMMENT_TARGET[action];

  await db.transaction(async (tx) => {
    const [c0] = await tx.select({ promptId: comments.promptId }).from(comments).where(eq(comments.id, id)).limit(1);
    if (!c0) throw new AppError("NOT_FOUND", "Comment not found");
    await tx.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, c0.promptId)).for("update");
    const [c] = await tx.select({ id: comments.id, status: comments.status, promptId: comments.promptId })
      .from(comments).where(eq(comments.id, id)).for("update").limit(1);
    if (!c) throw new AppError("NOT_FOUND", "Comment not found");
    if (c.status === to) return;
    if (action === "approve" && c.status !== "pending" && c.status !== "hidden") {
      throw new AppError("CONFLICT", `Can't approve a ${c.status} comment`);
    }
    if (action === "restore" && c.status !== "hidden" && c.status !== "removed") {
      throw new AppError("CONFLICT", `Can't restore a ${c.status} comment`);
    }
    if (c.status === "removed" && action !== "restore") throw new AppError("CONFLICT", "This comment was removed; restore it first");
    await tx.update(comments).set({ status: to }).where(eq(comments.id, id));
    await recountPromptComments(tx, c.promptId);
    const dismissed = to === "visible"
      ? await dismissOpenReports(tx, me, "comment", id, `Dismissed: comment was ${action === "approve" ? "approved" : "restored"}`)
      : 0;
    await logAction(tx, me, {
      targetType: "comment", targetId: id, action, reason: note,
      metadata: { from: c.status, to, ...(dismissed ? { dismissedReports: dismissed } : {}) },
    });
  });
}

/**
 * After a dismissal leaves no open reports: puts back content that was hidden automatically by the report threshold
 * (prompt: auto_hidden_at set; comment: its latest audit row is the system auto_hide), so a dismissed pile-on does not
 * leave the author silently hidden. Content an admin hid or removed is never touched.
 */
async function restoreAutoHidden(tx: Tx, admin: Mod, targetType: "prompt" | "comment", targetId: string): Promise<boolean> {
  if (targetType === "prompt") {
    const [p] = await tx.select().from(prompts).where(eq(prompts.id, targetId)).for("update").limit(1);
    if (!p || p.status !== "hidden" || !p.autoHiddenAt) return false;
    await tx.update(prompts).set({
      status: "published", autoHiddenAt: null, publishedAt: p.publishedAt ?? new Date(), approvedFromVersion: p.approvedFromVersion ?? p.version,
    }).where(eq(prompts.id, targetId));
    await recountPromptRelations(tx, { promptId: targetId, categoryIds: [p.categoryId], authorId: p.authorId, forkedFromId: p.forkedFromId });
    await logAction(tx, admin, { targetType, targetId, action: "restore", metadata: { from: "hidden", to: "published", via: "dismiss_report" } });
    return true;
  }
  const [c] = await tx.select({ status: comments.status, promptId: comments.promptId }).from(comments)
    .where(eq(comments.id, targetId)).for("update").limit(1);
  if (!c || c.status !== "hidden") return false;
  const [last] = await tx.select({ action: moderationActions.action }).from(moderationActions)
    .where(and(
      eq(moderationActions.targetType, "comment"), eq(moderationActions.targetId, targetId),
      inArray(moderationActions.action, ["auto_hide", "hide", "remove", "restore", "approve"]),
    )).orderBy(desc(moderationActions.createdAt)).limit(1);
  if (last?.action !== "auto_hide") return false;
  await tx.update(comments).set({ status: "visible" }).where(eq(comments.id, targetId));
  await recountPromptComments(tx, c.promptId);
  await logAction(tx, admin, { targetType, targetId, action: "restore", metadata: { from: "hidden", to: "visible", via: "dismiss_report" } });
  return true;
}

/**
 * Resolves every open report on the same target as `reportId` ("actioned" or "dismissed"), recounts the target's
 * open_report_count and logs resolve_report / dismiss_report.
 * Resolving an already-resolved report throws CONFLICT, unless `opts.tolerateResolved` is set (used right after a
 * moderate* call): then it returns quietly and writes no second audit entry.
 */
export async function resolveReport(
  admin: Viewer,
  reportId: string,
  resolution: "actioned" | "dismissed",
  note?: string,
  opts?: { tolerateResolved?: boolean },
): Promise<void> {
  const me = await requireActiveAdmin(admin);
  const id = parseInput(uuidSchema, reportId);
  const res = parseInput(z.enum(["actioned", "dismissed"]), resolution);
  const text = parseInput(reasonSchema, note);

  await db.transaction(async (tx) => {
    const [r] = await tx.select({ id: reports.id, targetType: reports.targetType, targetId: reports.targetId, status: reports.status })
      .from(reports).where(eq(reports.id, id)).limit(1);
    if (!r) throw new AppError("NOT_FOUND", "Report not found");
    if (r.status !== "open") {
      if (opts?.tolerateResolved) return;
      throw new AppError("CONFLICT", "This report was already resolved");
    }

    const resolved = await tx.update(reports).set({
      status: res, resolvedById: me.id, resolvedAt: new Date(), resolutionNote: text || null,
    }).where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, "open")))
      .returning({ id: reports.id });

    let restored = false;
    if (r.targetType === "prompt" || r.targetType === "comment") {
      // The target may have been deleted since the report was filed; the update is then a no-op.
      const open = await recountOpenReports(tx, r.targetType, r.targetId);
      if (res === "dismissed" && open === 0) restored = await restoreAutoHidden(tx, me, r.targetType, r.targetId);
    }
    await logAction(tx, me, {
      targetType: r.targetType, targetId: r.targetId, action: res === "actioned" ? "resolve_report" : "dismiss_report",
      reason: text, metadata: { reportId: id, resolvedReports: resolved.length, ...(restored ? { restored: true } : {}) },
    });
  });
}

/** Bans/unbans a user. Banning deletes the user's sessions. An admin can never ban themselves (FORBIDDEN). */
export async function setUserBan(admin: Viewer, userId: string, input: { banned: boolean; reason?: string }): Promise<void> {
  const me = await requireActiveAdmin(admin);
  if (userId === me.id || userId === admin.id) throw new AppError("FORBIDDEN", "You can't ban yourself");
  const data = parseInput(z.object({ banned: z.boolean(), reason: reasonSchema }), input);

  await db.transaction(async (tx) => {
    const [u] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update").limit(1);
    if (!u) throw new AppError("NOT_FOUND", "User not found");
    await tx.update(user).set({
      banned: data.banned, banReason: data.banned ? data.reason || null : null, banExpires: null,
    }).where(eq(user.id, userId));
    if (data.banned) await tx.delete(session).where(eq(session.userId, userId));
    await logAction(tx, me, { targetType: "user", targetId: userId, action: data.banned ? "ban" : "unban", reason: data.reason });
  });
}

export async function setTrustLevel(admin: Viewer, userId: string, level: TrustLevel): Promise<void> {
  const me = await requireActiveAdmin(admin);
  const lvl = parseInput(z.number().int().min(0).max(3), level) as TrustLevel;

  await db.transaction(async (tx) => {
    const [p] = await tx.select({ trustLevel: profiles.trustLevel }).from(profiles).where(eq(profiles.userId, userId)).for("update").limit(1);
    if (!p) throw new AppError("NOT_FOUND", "User not found");
    await tx.update(profiles).set({ trustLevel: lvl }).where(eq(profiles.userId, userId));
    await logAction(tx, me, { targetType: "user", targetId: userId, action: "set_trust", metadata: { from: p.trustLevel, to: lvl } });
  });
}
