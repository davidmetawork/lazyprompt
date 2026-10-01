// Server read layer for prompts (ARCHITECTURE.md sections 5, 7). Reads take plain arguments and return DTOs with ISO dates.
import "server-only";
import { cache } from "react";
import { and, asc, eq, gt, gte, ne, sql, desc, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { categories, profiles, promptModels, prompts, promptVersions, ratings, saves, user } from "@/db/schema";
import { DEFAULT_PAGE_SIZE, MAX_PAGE } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { listPromptsInputSchema, type ListPromptsInput } from "@/lib/validation";
import type {
  Paginated, PromptCard, PromptDetail, PromptStatus, PromptVersionDetail, PromptVersionSummary, Viewer, ViewerPromptState,
} from "@/lib/types";
import { enforceRateLimit, clientIp } from "@/server/rate-limit";
import { allOf, correctQuery, filterConditions, matchCondition, rankExpression, tokenize } from "@/server/search";
import {
  promptCardColumns, promptDetailColumns, toAuthorSummary, toPromptCard, toPromptDetail,
  type PromptCardRow, type PromptDetailRow,
} from "./mappers";

// ---------- shared helpers ----------

/** `withTotal: false` skips the `count(*) over()` window (home rows, related prompts never read the total). */
function cardQuery<E extends Record<string, SQL | SQL.Aliased | PgColumn>>(extra?: E, withTotal: boolean = true) {
  return db
    .select({
      ...promptCardColumns,
      total: withTotal ? sql<number>`count(*) over()::int` : sql<number>`0::int`,
      ...(extra ?? ({} as E)),
    })
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id));
}

// Explicit NULLS LAST: Drizzle's index `.desc()` is DESC NULLS LAST while a bare `DESC` sort is NULLS FIRST, which
// would stop the ordering indexes (prompts_top_idx, prompts_trending_idx, prompts_new_idx) from being used.
const descLast = (col: PgColumn): SQL => sql`${col} desc nulls last`;
const topOrder = () => [descLast(prompts.bayesScore), descLast(prompts.isFeatured), descLast(prompts.copyCount), descLast(prompts.publishedAt), asc(prompts.id)];
const newOrder = () => [descLast(prompts.publishedAt), descLast(prompts.createdAt), asc(prompts.id)];
const trendingOrder = () => [descLast(prompts.trendingScore), ...topOrder()];

const uuidSchema = z.uuid();
function assertUuid(value: string, field: string): void {
  if (!uuidSchema.safeParse(value).success) throw new AppError("VALIDATION", `${field} must be a valid id`, { [field]: ["Invalid id"] });
}
const asCard = (r: unknown): PromptCard => toPromptCard(r as PromptCardRow);

// ---------- detail ----------

async function loadDetail(where: SQL, includeNonPublic: boolean): Promise<PromptDetail | null> {
  const conds = includeNonPublic ? where : and(where, eq(prompts.status, "published"));
  const [row] = await db
    .select(promptDetailColumns)
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(conds)
    .limit(1);
  if (!row) return null;
  const detailRow = row as unknown as PromptDetailRow;

  const testedRows = await db
    .select({ model: promptModels.model, version: promptModels.testedVersion, date: promptModels.testedAt })
    .from(promptModels)
    .where(eq(promptModels.promptId, detailRow.id));
  const testedOn = testedRows
    .filter((t) => t.version !== null || t.date !== null)
    .map((t) => ({ model: t.model, version: t.version, date: t.date }));

  let forkedFrom: PromptDetail["forkedFrom"] = null;
  const [forkMeta] = await db
    .select({ forkedFromId: prompts.forkedFromId, forkedFromVersion: prompts.forkedFromVersion })
    .from(prompts).where(eq(prompts.id, detailRow.id)).limit(1);
  if (forkMeta?.forkedFromId) {
    const [parent] = await db
      .select({
        slug: prompts.slug, title: prompts.title,
        authorId: user.id, authorUsername: profiles.username, authorName: user.name,
        authorImage: user.image, authorIsSystem: profiles.isSystem,
      })
      .from(prompts)
      .innerJoin(user, eq(user.id, prompts.authorId))
      .leftJoin(profiles, eq(profiles.userId, user.id))
      .where(and(eq(prompts.id, forkMeta.forkedFromId), ne(prompts.status, "removed")))
      .limit(1);
    if (parent) {
      forkedFrom = { slug: parent.slug, title: parent.title, author: toAuthorSummary(parent), version: forkMeta.forkedFromVersion };
    }
  }

  return toPromptDetail(detailRow, { tags: detailRow.tags, models: detailRow.models, testedOn, forkedFrom }, { includeNonPublic });
}

// React cache() keys by argument identity: cache an inner function with PRIMITIVE args and wrap it.
const getPromptByShortIdCached = cache((shortId: string, includeNonPublic: boolean) =>
  loadDetail(eq(prompts.shortId, shortId), includeNonPublic));

export const getPromptByShortId = (shortId: string, opts?: { includeNonPublic?: boolean }): Promise<PromptDetail | null> =>
  getPromptByShortIdCached(shortId, opts?.includeNonPublic ?? false);

export async function getPromptById(id: string, opts?: { includeNonPublic?: boolean }): Promise<PromptDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return loadDetail(eq(prompts.id, id), opts?.includeNonPublic ?? false);
}

// ---------- lists ----------

type ParsedList = ReturnType<typeof listPromptsInputSchema.parse>;

async function runList(p: ParsedList, q: string | undefined): Promise<Paginated<PromptCard>> {
  const conds = filterConditions(p);
  if (q) conds.push(matchCondition(q));
  const sort = p.sort ?? (q ? "relevance" : "top");
  const offset = (p.page - 1) * p.pageSize;

  const base = q ? cardQuery({ rank: rankExpression(q) }) : cardQuery();
  const order =
    sort === "new" ? newOrder()
    : sort === "trending" ? trendingOrder()
    : sort === "relevance" && q ? [sql`rank desc`, ...topOrder()]
    : topOrder();
  const rows = await base.where(allOf(conds)).orderBy(...order).limit(p.pageSize).offset(offset);

  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && p.page > 1) {
    // Page past the end: the window count is gone with the rows, so count separately.
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId)).where(allOf(conds));
    total = c?.n ?? 0;
  }
  return {
    items: rows.map(asCard),
    page: p.page,
    pageSize: p.pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}

/**
 * Browse + search (section 5). With `q`: websearch_to_tsquery + trigram + escaped ILIKE, ranked by relevance. When the
 * query matches nothing, tokens are corrected against the title/tag vocabulary (typo tolerance) and the search is retried.
 */
export async function listPrompts(input: ListPromptsInput, opts?: { ip?: string | null }): Promise<Paginated<PromptCard>> {
  const p = listPromptsInputSchema.parse(input);
  const result = await runList(p, p.q);
  if (p.q && result.total === 0 && p.page === 1 && worthCorrecting(p.q)) {
    const corrected = await correctWithinBudget(p.q, opts?.ip);
    if (corrected) return runList(p, corrected);
  }
  return result;
}

/** Typo correction scans the whole title/tag vocabulary, so only short queries qualify. */
const CORRECTION_MAX_TOKENS = 3;
const CORRECTION_MAX_CHARS = 40;
const worthCorrecting = (q: string) => q.length <= CORRECTION_MAX_CHARS && tokenize(q).length <= CORRECTION_MAX_TOKENS;

/** Rate-limited (per IP hash) typo correction; a limit hit or a failure just means "no correction". */
async function correctWithinBudget(q: string, ip: string | null | undefined): Promise<string | null> {
  try {
    let who = ip;
    if (who === undefined) {
      try {
        who = clientIp(await headers());
      } catch (e) {
        unstable_rethrow(e);   // keep Next's dynamic-rendering signals; "no request scope" (scripts, tests) is fine
        who = null;
      }
    }
    await enforceRateLimit("search", { ip: who ?? undefined });
    return await correctQuery(q);
  } catch (e) {
    if (e instanceof AppError && e.code === "RATE_LIMITED") return null;
    unstable_rethrow(e);
    console.error("[search] typo correction failed", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

const HOME_FEATURED = 6;
const HOME_ROW = 12;

export async function getHomeSections(): Promise<{
  featured: PromptCard[]; trending: PromptCard[]; top: PromptCard[]; latest: PromptCard[];
}> {
  const pub = eq(prompts.status, "published");
  const run = async (where: SQL, order: SQL[], limit: number) =>
    (await cardQuery(undefined, false).where(where).orderBy(...order).limit(limit)).map(asCard);
  const [featured, trendingRaw, topPool, latest] = await Promise.all([
    run(and(pub, eq(prompts.isFeatured, true))!, topOrder(), HOME_FEATURED),
    run(and(pub, gt(prompts.trendingScore, 0))!, trendingOrder(), HOME_ROW),
    // 2x the row size guarantees enough distinct prompts to pad trending even when every trending prompt is also top.
    run(pub, topOrder(), HOME_ROW * 2),
    run(pub, newOrder(), HOME_ROW),
  ]);
  const top = topPool.slice(0, HOME_ROW);
  let trending = trendingRaw;
  if (trending.length < HOME_ROW) {
    const seen = new Set(trending.map((t) => t.id));
    trending = [...trending, ...topPool.filter((t) => !seen.has(t.id))].slice(0, HOME_ROW);
  }
  return { featured, trending, top, latest };
}

/** Published prompts sharing the category and/or tags with `promptId` (shared tags first), never the prompt itself. */
export async function getRelatedPrompts(promptId: string, limit: number = 6): Promise<PromptCard[]> {
  assertUuid(promptId, "promptId");
  const n = Math.min(Math.max(Math.trunc(limit) || 6, 1), 24);
  const rows = await cardQuery({
    shared: sql<number>`(select count(*) from prompt_tags a join prompt_tags b on b.tag_id = a.tag_id
      where a.prompt_id = ${promptId}::uuid and b.prompt_id = ${prompts.id})::int`.as("shared"),
  }, false)
    .where(and(
      eq(prompts.status, "published"),
      ne(prompts.id, promptId),
      sql`(${prompts.categoryId} = (select category_id from prompts where id = ${promptId}::uuid)
        or exists (select 1 from prompt_tags a join prompt_tags b on b.tag_id = a.tag_id
          where a.prompt_id = ${promptId}::uuid and b.prompt_id = ${prompts.id}))`,
    ))
    .orderBy(
      sql`shared desc`,
      sql`(${prompts.categoryId} = (select category_id from prompts where id = ${promptId}::uuid)) desc`,
      ...topOrder(),
    )
    .limit(n);
  return rows.map(asCard);
}

// ---------- versions ----------
// Callers (the /p/[slug]/versions pages) gate on prompt visibility via getPromptByShortId first.

/** Versions below the one first made public (never approved, or edited out before approval) are not served. */
const approvedVersions = (promptId: string) =>
  gte(promptVersions.version, sql`coalesce((select ${prompts.approvedFromVersion} from ${prompts} where ${prompts.id} = ${promptId}::uuid), 1)`);

export async function listPromptVersions(promptId: string): Promise<PromptVersionSummary[]> {
  assertUuid(promptId, "promptId");
  const rows = await db
    .select({
      version: promptVersions.version, title: promptVersions.title, changeNote: promptVersions.changeNote,
      createdAt: promptVersions.createdAt,
      editorId: user.id, editorName: user.name, editorImage: user.image,
      editorUsername: profiles.username, editorIsSystem: profiles.isSystem,
    })
    .from(promptVersions)
    .leftJoin(user, eq(user.id, promptVersions.editorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(and(eq(promptVersions.promptId, promptId), approvedVersions(promptId)))
    .orderBy(desc(promptVersions.version));
  return rows.map((r) => ({
    version: r.version,
    title: r.title,
    changeNote: r.changeNote,
    createdAt: r.createdAt.toISOString(),
    editor: r.editorId
      ? toAuthorSummary({
        authorId: r.editorId, authorUsername: r.editorUsername, authorName: r.editorName ?? "", authorImage: r.editorImage,
        authorIsSystem: r.editorIsSystem,
      })
      : null,
  }));
}

export async function getPromptVersion(promptId: string, version: number): Promise<PromptVersionDetail | null> {
  assertUuid(promptId, "promptId");
  if (!Number.isInteger(version) || version < 1) throw new AppError("VALIDATION", "version must be a positive integer", { version: ["Invalid version"] });
  const [r] = await db
    .select({
      version: promptVersions.version, title: promptVersions.title, changeNote: promptVersions.changeNote,
      createdAt: promptVersions.createdAt, description: promptVersions.description, body: promptVersions.body,
      variables: promptVersions.variables, exampleOutput: promptVersions.exampleOutput, notes: promptVersions.notes,
      editorId: user.id, editorName: user.name, editorImage: user.image,
      editorUsername: profiles.username, editorIsSystem: profiles.isSystem,
    })
    .from(promptVersions)
    .leftJoin(user, eq(user.id, promptVersions.editorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.version, version), approvedVersions(promptId)))
    .limit(1);
  if (!r) return null;
  return {
    version: r.version,
    title: r.title,
    changeNote: r.changeNote,
    createdAt: r.createdAt.toISOString(),
    editor: r.editorId
      ? toAuthorSummary({
        authorId: r.editorId, authorUsername: r.editorUsername, authorName: r.editorName ?? "", authorImage: r.editorImage,
        authorIsSystem: r.editorIsSystem,
      })
      : null,
    description: r.description,
    body: r.body,
    variables: r.variables ?? [],
    exampleOutput: r.exampleOutput,
    notes: r.notes,
  };
}

export async function getViewerPromptState(promptId: string, viewer: Viewer | null): Promise<ViewerPromptState> {
  if (!viewer) return { rating: null, saved: false, isAuthor: false, canEdit: false };
  const [[owner], [rating], [saved]] = await Promise.all([
    db.select({ authorId: prompts.authorId }).from(prompts).where(eq(prompts.id, promptId)).limit(1),
    db.select({ stars: ratings.stars }).from(ratings)
      .where(and(eq(ratings.promptId, promptId), eq(ratings.userId, viewer.id))).limit(1),
    db.select({ userId: saves.userId }).from(saves)
      .where(and(eq(saves.promptId, promptId), eq(saves.userId, viewer.id))).limit(1),
  ]);
  const isAuthor = owner?.authorId === viewer.id;
  return {
    rating: rating?.stars ?? null,
    saved: Boolean(saved),
    isAuthor,
    canEdit: isAuthor || viewer.role === "admin",
  };
}

/**
 * An author's prompts, newest first (page size 24). Public callers get published rows only; `includeNonPublic` (the author
 * or an admin) adds draft/pending/rejected/hidden rows, with `status` and `moderationNote`. Soft-deleted ("removed") rows
 * are never listed.
 */
export async function listPromptsByAuthor(
  authorId: string,
  opts?: { page?: number; includeNonPublic?: boolean },
): Promise<Paginated<PromptCard & { status: PromptStatus; moderationNote: string | null }>> {
  const page = opts?.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new AppError("VALIDATION", "page must be between 1 and 50", { page: ["Invalid page"] });
  if (!authorId) throw new AppError("VALIDATION", "authorId is required", { authorId: ["Required"] });
  const includeNonPublic = opts?.includeNonPublic ?? false;
  const pageSize = DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const where = and(
    eq(prompts.authorId, authorId),
    includeNonPublic ? ne(prompts.status, "removed") : eq(prompts.status, "published"),
  )!;
  const rows = await cardQuery({ status: prompts.status, moderationNote: prompts.moderationNote })
    .where(where)
    .orderBy(desc(sql`coalesce(${prompts.publishedAt}, ${prompts.createdAt})`), asc(prompts.id))
    .limit(pageSize)
    .offset(offset);
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && page > 1) {
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(prompts).where(where);
    total = c?.n ?? 0;
  }
  return {
    items: rows.map((r) => ({
      ...asCard(r),
      status: r.status,
      moderationNote: includeNonPublic ? r.moderationNote : null,
    })),
    page,
    pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}

/** Published prompts for the sitemap, most recently updated first (the protocol cap is 50,000 URLs). */
export async function listSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  const rows = await db
    .select({ slug: prompts.slug, updatedAt: prompts.updatedAt })
    .from(prompts)
    .where(eq(prompts.status, "published"))
    .orderBy(desc(prompts.updatedAt), asc(prompts.id))
    .limit(50_000);
  return rows.map((r) => ({ slug: r.slug, updatedAt: r.updatedAt.toISOString() }));
}

/**
 * Duplicate detection (section 5). Candidates: top 30 published prompts by ts_rank_cd against an OR-ed tsquery of
 * title + first 300 chars of body (plus trigram title matches). Score = greatest(similarity(title), similarity(body 2000)).
 * Callers flag `similarity > 0.85` as duplicate.
 */
export async function findSimilarPrompts(
  input: { title: string; body: string },
  opts?: { excludeId?: string; limit?: number },
): Promise<{ id: string; slug: string; title: string; similarity: number }[]> {
  const title = input.title.trim();
  const body = input.body;
  const text = `${title} ${body.slice(0, 300)}`;
  const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 30);
  const exclude = opts?.excludeId ?? null;

  const res = await db.execute<{ id: string; slug: string; title: string; similarity: number }>(sql`
    WITH q AS (
      SELECT to_tsquery('english', replace(plainto_tsquery('english', ${text})::text, '&', '|')) AS tsq
    ),
    cand AS (
      SELECT p.id, p.slug, p.title, p.body
      FROM prompts p, q
      WHERE p.status = 'published'
        AND (${exclude}::uuid IS NULL OR p.id <> ${exclude}::uuid)
        AND (p.search @@ q.tsq OR p.title % ${title})
      ORDER BY ts_rank_cd(p.search, q.tsq) DESC
      LIMIT 30
    )
    SELECT id, slug, title,
           greatest(similarity(title, ${title}), similarity(left(body, 2000), left(${body}, 2000)))::float8 AS similarity
    FROM cand
    ORDER BY similarity DESC
    LIMIT ${limit}
  `);
  return res.rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, similarity: Number(r.similarity) }));
}
