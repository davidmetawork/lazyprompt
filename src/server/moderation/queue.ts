import "server-only";
import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  categories, comments, moderationActions, profiles, prompts, reports, usageEvents, user,
} from "@/db/schema";
import { USAGE_EVENT_TYPES, MAX_PAGE } from "@/lib/constants";
import type {
  AdminStats, AdminUserRow, AuthorSummary, ModerationLogItem, ModerationQueueItem, Paginated, PromptCard,
  PromptStatus, ReportItem, ReportStatus, TrustLevel, UsageEventType, Viewer,
} from "@/lib/types";
import { promptCardColumns, toPromptCard, type PromptCardRow } from "@/server/prompts/mappers";
import { assertAdmin } from "./guards";

const QUEUE_PAGE_SIZE = 25;
const LOG_PAGE_SIZE = 50;

function pageOf(page: number | undefined): number {
  return Number.isFinite(page) ? Math.min(Math.max(Math.trunc(page as number), 1), MAX_PAGE) : 1;
}
function paginated<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, page, pageSize, total, hasMore: (page - 1) * pageSize + items.length < total };
}
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}
const excerptOf = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

function authorOf(r: {
  authorId: string; authorUsername: string | null; authorName: string; authorImage: string | null; authorIsSystem: boolean | null;
}): AuthorSummary {
  return { id: r.authorId, username: r.authorUsername ?? "", name: r.authorName, image: r.authorImage, isSystem: r.authorIsSystem ?? false };
}

/** Pending prompts or comments, oldest first. */
export async function getModerationQueue(
  admin: Viewer,
  input: { kind: "prompt" | "comment"; page?: number },
): Promise<Paginated<ModerationQueueItem>> {
  assertAdmin(admin);
  const page = pageOf(input.page);
  const offset = (page - 1) * QUEUE_PAGE_SIZE;

  if (input.kind === "prompt") {
    const rows = await db
      .select({
        id: prompts.id, title: prompts.title, description: prompts.description, flags: prompts.moderationFlags,
        createdAt: prompts.createdAt, slug: prompts.slug, openReportCount: prompts.openReportCount,
        authorId: user.id, authorUsername: profiles.username, authorName: user.name, authorImage: user.image,
        authorIsSystem: profiles.isSystem, trustLevel: profiles.trustLevel, total: sql<number>`count(*) over()::int`,
      })
      .from(prompts)
      .innerJoin(user, eq(user.id, prompts.authorId))
      .leftJoin(profiles, eq(profiles.userId, user.id))
      .where(eq(prompts.status, "pending"))
      .orderBy(asc(prompts.createdAt), asc(prompts.id))
      .limit(QUEUE_PAGE_SIZE).offset(offset);
    const items: ModerationQueueItem[] = rows.map((r) => ({
      kind: "prompt", id: r.id, title: r.title, excerpt: excerptOf(r.description), flags: r.flags ?? [],
      author: { ...authorOf(r), trustLevel: (r.trustLevel ?? 0) as TrustLevel },
      createdAt: r.createdAt.toISOString(), promptSlug: r.slug, openReportCount: r.openReportCount,
    }));
    return paginated(items, rows[0]?.total ?? 0, page, QUEUE_PAGE_SIZE);
  }

  const rows = await db
    .select({
      id: comments.id, body: comments.body, flags: comments.moderationFlags, createdAt: comments.createdAt,
      openReportCount: comments.openReportCount, promptTitle: prompts.title, promptSlug: prompts.slug,
      authorId: user.id, authorUsername: profiles.username, authorName: user.name, authorImage: user.image,
      authorIsSystem: profiles.isSystem, trustLevel: profiles.trustLevel, total: sql<number>`count(*) over()::int`,
    })
    .from(comments)
    .innerJoin(prompts, eq(prompts.id, comments.promptId))
    .innerJoin(user, eq(user.id, comments.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(comments.status, "pending"))
    .orderBy(asc(comments.createdAt), asc(comments.id))
    .limit(QUEUE_PAGE_SIZE).offset(offset);
  const items: ModerationQueueItem[] = rows.map((r) => ({
    kind: "comment", id: r.id, title: r.promptTitle, excerpt: excerptOf(r.body), flags: r.flags ?? [],
    author: { ...authorOf(r), trustLevel: (r.trustLevel ?? 0) as TrustLevel },
    createdAt: r.createdAt.toISOString(), promptSlug: r.promptSlug, openReportCount: r.openReportCount,
  }));
  return paginated(items, rows[0]?.total ?? 0, page, QUEUE_PAGE_SIZE);
}

/** Reports (default: open ones), oldest first, each with the number of open reports on the same target. */
export async function listReports(
  admin: Viewer,
  input: { status?: ReportStatus; page?: number },
): Promise<Paginated<ReportItem>> {
  assertAdmin(admin);
  const page = pageOf(input.page);
  const status = input.status ?? "open";
  const offset = (page - 1) * QUEUE_PAGE_SIZE;

  const rows = await db
    .select({
      id: reports.id, targetType: reports.targetType, targetId: reports.targetId, reason: reports.reason,
      details: reports.details, status: reports.status, createdAt: reports.createdAt,
      authorId: user.id, authorUsername: profiles.username, authorName: user.name, authorImage: user.image,
      authorIsSystem: profiles.isSystem,
      sameTargetOpenCount: sql<number>`(select count(*)::int from reports r2 where r2.target_type = ${reports.targetType}
        and r2.target_id = ${reports.targetId} and r2.status = 'open')`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(reports)
    .innerJoin(user, eq(user.id, reports.reporterId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(reports.status, status))
    .orderBy(status === "open" ? asc(reports.createdAt) : desc(reports.createdAt), asc(reports.id))
    .limit(QUEUE_PAGE_SIZE).offset(offset);

  const ids = (t: "prompt" | "comment" | "user") => [...new Set(rows.filter((r) => r.targetType === t).map((r) => r.targetId))];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const promptIds = ids("prompt").filter((x) => uuid.test(x));
  const commentIds = ids("comment").filter((x) => uuid.test(x));
  const userIds = ids("user");

  const [promptRows, commentRows, userRows] = await Promise.all([
    promptIds.length
      ? db.select({ id: prompts.id, title: prompts.title, slug: prompts.slug, status: prompts.status }).from(prompts).where(inArray(prompts.id, promptIds))
      : [],
    commentIds.length
      ? db.select({ id: comments.id, body: comments.body, status: comments.status, slug: prompts.slug })
          .from(comments).innerJoin(prompts, eq(prompts.id, comments.promptId)).where(inArray(comments.id, commentIds))
      : [],
    userIds.length
      ? db.select({ id: user.id, name: user.name, username: profiles.username, banned: user.banned })
          .from(user).leftJoin(profiles, eq(profiles.userId, user.id)).where(inArray(user.id, userIds))
      : [],
  ]);
  const pMap = new Map(promptRows.map((p) => [p.id, p]));
  const cMap = new Map(commentRows.map((c) => [c.id, c]));
  const uMap = new Map(userRows.map((u) => [u.id, u]));

  const items: ReportItem[] = rows.map((r) => {
    let target: ReportItem["target"] = { label: "(deleted)", href: "/", status: "deleted" };
    if (r.targetType === "prompt") {
      const p = pMap.get(r.targetId);
      if (p) target = { label: p.title, href: `/p/${p.slug}`, status: p.status };
    } else if (r.targetType === "comment") {
      const c = cMap.get(r.targetId);
      if (c) target = { label: excerptOf(c.body, 120), href: `/p/${c.slug}#comment-${c.id}`, status: c.status };
    } else {
      const u = uMap.get(r.targetId);
      if (u) target = { label: u.username ?? u.name, href: u.username ? `/u/${u.username}` : "/", status: u.banned ? "banned" : "active" };
    }
    return {
      id: r.id, targetType: r.targetType, targetId: r.targetId, reason: r.reason, details: r.details, status: r.status,
      reporter: authorOf(r), target, createdAt: r.createdAt.toISOString(), sameTargetOpenCount: Number(r.sameTargetOpenCount),
    };
  });
  return paginated(items, rows[0]?.total ?? 0, page, QUEUE_PAGE_SIZE);
}

export async function getAdminStats(admin: Viewer): Promise<AdminStats> {
  assertAdmin(admin);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [counts, events] = await Promise.all([
    db.execute<{
      pending_prompts: number; pending_comments: number; open_reports: number; hidden_prompts: number;
      users_total: number; users_7d: number; published: number;
    }>(sql`SELECT
      (SELECT count(*)::int FROM prompts WHERE status = 'pending') AS pending_prompts,
      (SELECT count(*)::int FROM comments WHERE status = 'pending') AS pending_comments,
      (SELECT count(*)::int FROM reports WHERE status = 'open') AS open_reports,
      (SELECT count(*)::int FROM prompts WHERE status = 'hidden') AS hidden_prompts,
      (SELECT count(*)::int FROM "user") AS users_total,
      (SELECT count(*)::int FROM "user" WHERE created_at >= ${since}) AS users_7d,
      (SELECT count(*)::int FROM prompts WHERE status = 'published') AS published`),
    db.select({ type: usageEvents.type, n: sql<number>`count(*)::int` }).from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${since}`).groupBy(usageEvents.type),
  ]);
  const c = counts.rows[0];
  const events7d = Object.fromEntries(USAGE_EVENT_TYPES.map((t) => [t, 0])) as Record<UsageEventType, number>;
  for (const e of events) events7d[e.type] = Number(e.n);
  return {
    pendingPrompts: Number(c?.pending_prompts ?? 0),
    pendingComments: Number(c?.pending_comments ?? 0),
    openReports: Number(c?.open_reports ?? 0),
    hiddenPrompts: Number(c?.hidden_prompts ?? 0),
    usersTotal: Number(c?.users_total ?? 0),
    usersLast7d: Number(c?.users_7d ?? 0),
    promptsPublished: Number(c?.published ?? 0),
    events7d,
  };
}

export async function listModerationLog(admin: Viewer, page?: number): Promise<Paginated<ModerationLogItem>> {
  assertAdmin(admin);
  const pg = pageOf(page);
  const rows = await db
    .select({
      id: moderationActions.id, targetType: moderationActions.targetType, targetId: moderationActions.targetId,
      action: moderationActions.action, reason: moderationActions.reason, createdAt: moderationActions.createdAt,
      actorId: user.id, actorUsername: profiles.username, actorName: user.name, actorImage: user.image,
      actorIsSystem: profiles.isSystem, total: sql<number>`count(*) over()::int`,
    })
    .from(moderationActions)
    .leftJoin(user, eq(user.id, moderationActions.actorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .orderBy(desc(moderationActions.createdAt), desc(moderationActions.id))
    .limit(LOG_PAGE_SIZE).offset((pg - 1) * LOG_PAGE_SIZE);
  const items: ModerationLogItem[] = rows.map((r) => ({
    id: r.id,
    actor: r.actorId
      ? { id: r.actorId, username: r.actorUsername ?? "", name: r.actorName ?? "", image: r.actorImage, isSystem: r.actorIsSystem ?? false }
      : null,
    targetType: r.targetType, targetId: r.targetId, action: r.action, reason: r.reason, createdAt: r.createdAt.toISOString(),
  }));
  return paginated(items, rows[0]?.total ?? 0, pg, LOG_PAGE_SIZE);
}

export async function listAdminUsers(
  admin: Viewer,
  input: { q?: string; page?: number },
): Promise<Paginated<AdminUserRow>> {
  assertAdmin(admin);
  const pg = pageOf(input.page);
  const q = input.q?.trim().slice(0, 100);
  const conds: SQL[] = [];
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(
      sql`${user.email} ILIKE ${like}`, sql`${user.name} ILIKE ${like}`, sql`${profiles.username}::text ILIKE ${like}`,
    )!);
  }
  const rows = await db
    .select({
      id: user.id, email: user.email, name: user.name, username: profiles.username, role: user.role,
      trustLevel: profiles.trustLevel, banned: user.banned, createdAt: user.createdAt,
      promptCount: sql<number>`(select count(*)::int from prompts p where p.author_id = ${user.id} and p.status <> 'removed')`,
      total: sql<number>`count(*) over()::int`,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(user.createdAt), asc(user.id))
    .limit(QUEUE_PAGE_SIZE).offset((pg - 1) * QUEUE_PAGE_SIZE);
  const items: AdminUserRow[] = rows.map((r) => ({
    id: r.id, email: r.email, name: r.name, username: r.username ?? "", role: r.role ?? "user",
    trustLevel: (r.trustLevel ?? 0) as TrustLevel, banned: Boolean(r.banned), createdAt: r.createdAt.toISOString(),
    promptCount: Number(r.promptCount),
  }));
  return paginated(items, rows[0]?.total ?? 0, pg, QUEUE_PAGE_SIZE);
}

/** Prompts across all statuses (newest first) with their status and moderation flags. */
export async function listAdminPrompts(
  admin: Viewer,
  input: { q?: string; status?: PromptStatus; page?: number },
): Promise<Paginated<PromptCard & { status: PromptStatus; moderationFlags: string[] }>> {
  assertAdmin(admin);
  const pg = pageOf(input.page);
  const q = input.q?.trim().slice(0, 100);
  const conds: SQL[] = [];
  if (input.status) conds.push(eq(prompts.status, input.status));
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(
      sql`${prompts.title} ILIKE ${like}`, sql`${prompts.description} ILIKE ${like}`, sql`${prompts.tagsText} ILIKE ${like}`,
      sql`${profiles.username}::text ILIKE ${like}`,
    )!);
  }
  const rows = await db
    .select({
      ...promptCardColumns, status: prompts.status, moderationFlags: prompts.moderationFlags,
      total: sql<number>`count(*) over()::int`,
    })
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(prompts.createdAt), asc(prompts.id))
    .limit(QUEUE_PAGE_SIZE).offset((pg - 1) * QUEUE_PAGE_SIZE);
  const items = rows.map((r) => ({
    ...toPromptCard(r as unknown as PromptCardRow), status: r.status, moderationFlags: r.moderationFlags ?? [],
  }));
  return paginated(items, rows[0]?.total ?? 0, pg, QUEUE_PAGE_SIZE);
}
