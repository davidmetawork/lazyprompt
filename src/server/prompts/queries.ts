/* eslint-disable @typescript-eslint/no-unused-vars */
// Foundation implements: getPromptByShortId, getPromptById, listPrompts (simple ILIKE for q), getHomeSections,
// getViewerPromptState, findSimilarPrompts. data-read replaces the rest (and upgrades listPrompts search, section 5).
import "server-only";
import { cache } from "react";
import { and, desc, eq, exists, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, profiles, promptModels, prompts, ratings, saves, user } from "@/db/schema";
import { notImplemented } from "@/lib/errors";
import { listPromptsInputSchema, type ListPromptsInput } from "@/lib/validation";
import type {
  Paginated, PromptCard, PromptDetail, PromptStatus, PromptVersionDetail, PromptVersionSummary, Viewer, ViewerPromptState,
} from "@/lib/types";
import {
  promptCardColumns, promptDetailColumns, toAuthorSummary, toPromptCard, toPromptDetail,
  type PromptCardRow, type PromptDetailRow,
} from "./mappers";

// ---------- shared helpers ----------

function cardQuery() {
  return db
    .select({ ...promptCardColumns, total: sql<number>`count(*) over()::int` })
    .from(prompts)
    .innerJoin(categories, eq(categories.id, prompts.categoryId))
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id));
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const topOrder = () => [desc(prompts.bayesScore), desc(prompts.isFeatured), desc(prompts.copyCount), desc(prompts.publishedAt)];
const newOrder = () => [desc(prompts.publishedAt), desc(prompts.createdAt)];

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

export async function listPrompts(input: ListPromptsInput): Promise<Paginated<PromptCard>> {
  const p = listPromptsInputSchema.parse(input);
  const conds: SQL[] = [eq(prompts.status, "published")];
  if (p.category) conds.push(eq(categories.slug, p.category));
  if (p.useCase) conds.push(eq(prompts.useCase, p.useCase));
  if (p.authorId) conds.push(eq(prompts.authorId, p.authorId));
  if (p.model) {
    // "any model" prompts (no prompt_models rows) are included too.
    conds.push(or(
      exists(db.select({ x: sql`1` }).from(promptModels)
        .where(and(eq(promptModels.promptId, prompts.id), eq(promptModels.model, p.model)))),
      sql`not exists (select 1 from prompt_models pm0 where pm0.prompt_id = ${prompts.id})`,
    )!);
  }
  if (p.tag) {
    // Resolve through alias_of_id: match prompts tagged with the canonical tag or any alias of it.
    conds.push(sql`exists (
      select 1 from prompt_tags pt
      join tags t on t.id = pt.tag_id
      where pt.prompt_id = ${prompts.id}
        and coalesce(t.alias_of_id, t.id) = (select coalesce(t2.alias_of_id, t2.id) from tags t2 where t2.slug = ${p.tag} limit 1)
    )`);
  }
  if (p.q) {
    const like = `%${escapeLike(p.q)}%`;
    conds.push(or(
      sql`${prompts.title} ILIKE ${like}`,
      sql`${prompts.description} ILIKE ${like}`,
      sql`${prompts.tagsText} ILIKE ${like}`,
    )!);
  }

  const sort = p.sort ?? (p.q ? "relevance" : "top");
  const order = sort === "new" ? newOrder() : topOrder();   // relevance/trending map to top until data-read lands
  const offset = (p.page - 1) * p.pageSize;

  const rows = await cardQuery().where(and(...conds)).orderBy(...order).limit(p.pageSize).offset(offset);
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && p.page > 1) {
    const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(prompts)
      .innerJoin(categories, eq(categories.id, prompts.categoryId)).where(and(...conds));
    total = c?.n ?? 0;
  }
  return {
    items: rows.map((r) => toPromptCard(r as unknown as PromptCardRow)),
    page: p.page,
    pageSize: p.pageSize,
    total,
    hasMore: offset + rows.length < total,
  };
}

export async function getHomeSections(): Promise<{
  featured: PromptCard[]; trending: PromptCard[]; top: PromptCard[]; latest: PromptCard[];
}> {
  const pub = eq(prompts.status, "published");
  const run = async (where: SQL, order: SQL[], limit: number) =>
    (await cardQuery().where(where).orderBy(...order).limit(limit)).map((r) => toPromptCard(r as unknown as PromptCardRow));
  const [featured, top, latest] = await Promise.all([
    run(and(pub, eq(prompts.isFeatured, true))!, topOrder(), 6),
    run(pub, topOrder(), 8),
    run(pub, newOrder(), 8),
  ]);
  return { featured, trending: top, top, latest };   // trending = top until data-read computes real trending
}

export async function getRelatedPrompts(promptId: string, limit?: number): Promise<PromptCard[]> {
  return notImplemented("getRelatedPrompts");
}
export async function listPromptVersions(promptId: string): Promise<PromptVersionSummary[]> {
  return notImplemented("listPromptVersions");
}
export async function getPromptVersion(promptId: string, version: number): Promise<PromptVersionDetail | null> {
  return notImplemented("getPromptVersion");
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

export async function listPromptsByAuthor(
  authorId: string,
  opts?: { page?: number; includeNonPublic?: boolean },
): Promise<Paginated<PromptCard & { status: PromptStatus; moderationNote: string | null }>> {
  return notImplemented("listPromptsByAuthor");
}

export async function listSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  return notImplemented("listSitemapEntries");
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
