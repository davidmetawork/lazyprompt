import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { comments, moderationActions, profiles, prompts, reports, user } from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { reportInputSchema, type ReportInput } from "@/lib/validation";
import type { Viewer } from "@/lib/types";
import {
  recountOpenReports, recountPromptComments, recountPromptRelations,
} from "@/server/moderation/counters";
import { getActiveActor, isUniqueViolation, parseInput } from "@/server/moderation/guards";
import { enforceRateLimit } from "@/server/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Reporters this new (and untrusted) do not count toward the auto-hide threshold: one person cannot sockpuppet a takedown. */
const REPORTER_MIN_AGE_DAYS = 7;
const duplicateReport = () => new AppError("CONFLICT", "You have already reported this");

async function authorTrust(tx: Tx, authorId: string): Promise<number> {
  const [row] = await tx.select({ t: profiles.trustLevel }).from(profiles).where(eq(profiles.userId, authorId)).limit(1);
  return row?.t ?? 0;
}

/**
 * One open report per reporter and target. Fills reports.prompt_id for prompt and comment targets, keeps
 * open_report_count right and auto-hides the target once REPORT_AUTOHIDE_THRESHOLD distinct reporters have an open
 * report on it (the audit row has a null actor and action auto_hide). Only established reporters (trust level 1+ or an
 * account older than 7 days) count, and featured prompts or content by trust 2+ authors are never auto-hidden: they stay
 * in the queue through open_report_count. Reports on users only go to the queue.
 */
export async function createReport(actor: Viewer, input: ReportInput): Promise<{ id: string; autoHidden: boolean }> {
  const me = await getActiveActor(actor);
  const data = parseInput(reportInputSchema, input);
  await enforceRateLimit("report", { userId: me.id, trustLevel: me.trustLevel });
  const threshold = env.REPORT_AUTOHIDE_THRESHOLD;
  const notFound = () => new AppError("NOT_FOUND", "That content no longer exists");

  try {
    return await db.transaction(async (tx) => {
      let promptId: string | null = null;
      let protectedTarget = false;   // never auto-hide: featured prompt or trusted author

      if (data.targetType === "prompt") {
        if (!UUID_RE.test(data.targetId)) throw notFound();
        const [p] = await tx.select({ id: prompts.id, authorId: prompts.authorId, status: prompts.status, isFeatured: prompts.isFeatured })
          .from(prompts).where(eq(prompts.id, data.targetId)).for("update").limit(1);
        if (!p || p.status !== "published") throw notFound();
        if (p.authorId === me.id) throw new AppError("FORBIDDEN", "You can't report your own content");
        promptId = p.id;
        protectedTarget = p.isFeatured || (await authorTrust(tx, p.authorId)) >= 2;
      } else if (data.targetType === "comment") {
        if (!UUID_RE.test(data.targetId)) throw notFound();
        const [c0] = await tx.select({ promptId: comments.promptId }).from(comments).where(eq(comments.id, data.targetId)).limit(1);
        if (!c0) throw notFound();
        // Same lock order as every other writer: prompt first, then comment.
        await tx.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, c0.promptId)).for("update");
        const [c] = await tx.select({ id: comments.id, authorId: comments.authorId, status: comments.status })
          .from(comments).where(eq(comments.id, data.targetId)).for("update").limit(1);
        if (!c || c.status !== "visible") throw notFound();
        if (c.authorId === me.id) throw new AppError("FORBIDDEN", "You can't report your own content");
        promptId = c0.promptId;
        protectedTarget = (await authorTrust(tx, c.authorId)) >= 2;
      } else {
        const [u] = await tx.select({ id: user.id }).from(user).innerJoin(profiles, eq(profiles.userId, user.id))
          .where(eq(user.id, data.targetId)).limit(1);
        if (!u) throw notFound();
        if (u.id === me.id) throw new AppError("FORBIDDEN", "You can't report yourself");
      }

      const [dup] = await tx.select({ id: reports.id }).from(reports).where(and(
        eq(reports.reporterId, me.id), eq(reports.targetType, data.targetType),
        eq(reports.targetId, data.targetId), eq(reports.status, "open"),
      )).limit(1);
      if (dup) throw duplicateReport();

      const [row] = await tx.insert(reports).values({
        reporterId: me.id, targetType: data.targetType, targetId: data.targetId, promptId,
        reason: data.reason, details: data.details || null,
      }).returning({ id: reports.id });

      let autoHidden = false;
      if (data.targetType !== "user") {
        await recountOpenReports(tx, data.targetType, data.targetId);
        const res = await tx.execute<{ n: number }>(sql`
          SELECT count(DISTINCT r.reporter_id)::int AS n
          FROM reports r
          JOIN "user" u ON u.id = r.reporter_id
          LEFT JOIN profiles pr ON pr.user_id = r.reporter_id
          WHERE r.target_type = ${data.targetType} AND r.target_id = ${data.targetId} AND r.status = 'open'
            AND (coalesce(pr.trust_level, 0) >= 1 OR u.created_at < now() - make_interval(days => ${REPORTER_MIN_AGE_DAYS}))`);
        const distinct = Number(res.rows[0]?.n ?? 0);
        if (distinct >= threshold && !protectedTarget) {
          if (data.targetType === "prompt") {
            const hidden = await tx.update(prompts)
              .set({ status: "hidden", autoHiddenAt: new Date() })
              .where(and(eq(prompts.id, data.targetId), eq(prompts.status, "published")))
              .returning({ categoryId: prompts.categoryId, authorId: prompts.authorId, forkedFromId: prompts.forkedFromId });
            if (hidden[0]) {
              autoHidden = true;
              await recountPromptRelations(tx, {
                promptId: data.targetId, categoryIds: [hidden[0].categoryId], authorId: hidden[0].authorId,
                forkedFromId: hidden[0].forkedFromId,
              });
            }
          } else {
            const hidden = await tx.update(comments).set({ status: "hidden" })
              .where(and(eq(comments.id, data.targetId), eq(comments.status, "visible")))
              .returning({ promptId: comments.promptId });
            if (hidden[0]) {
              autoHidden = true;
              await recountPromptComments(tx, hidden[0].promptId);
            }
          }
          if (autoHidden) {
            await tx.insert(moderationActions).values({
              actorId: null, targetType: data.targetType, targetId: data.targetId, action: "auto_hide",
              reason: `Auto-hidden after ${distinct} open reports`, metadata: { reporters: distinct, threshold },
            });
          }
        }
      }
      return { id: row!.id, autoHidden };
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicateReport();
    throw e;
  }
}
