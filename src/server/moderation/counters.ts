// Denormalized counter recomputation. Every helper recounts from source rows inside the caller's transaction
// (ARCHITECTURE.md section 3, "Counters invariant"). Raw SQL on purpose: counters must not bump updated_at.
import "server-only";
import { sql } from "drizzle-orm";
import type { Tx } from "@/db";

export async function recountCategory(tx: Tx, categoryId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE categories c SET prompt_count =
      (SELECT count(*)::int FROM prompts p WHERE p.category_id = c.id AND p.status = 'published')
    WHERE c.id = ${categoryId}`);
}

export async function recountTags(tx: Tx, tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) return;
  await tx.execute(sql`
    UPDATE tags t SET prompt_count =
      (SELECT count(*)::int FROM prompt_tags pt JOIN prompts p ON p.id = pt.prompt_id
       WHERE pt.tag_id = t.id AND p.status = 'published')
    WHERE t.id IN (${sql.join(tagIds.map((id) => sql`${id}`), sql`, `)})`);
}

export async function recountAuthor(tx: Tx, authorId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE profiles SET published_prompt_count =
      (SELECT count(*)::int FROM prompts p WHERE p.author_id = profiles.user_id AND p.status = 'published')
    WHERE user_id = ${authorId}`);
}

/** Forks that still exist (not removed, rejected or draft) count towards the parent. */
export async function recountForks(tx: Tx, parentId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE prompts SET fork_count =
      (SELECT count(*)::int FROM prompts f WHERE f.forked_from_id = prompts.id
       AND f.status IN ('published', 'pending', 'hidden'))
    WHERE id = ${parentId}`);
}

/**
 * Recount everything a prompt's status/category/tags can affect: its category (and optionally a previous one),
 * its tags, its author's published count and its parent's fork count.
 */
export async function recountPromptRelations(
  tx: Tx,
  p: { promptId: string; categoryIds: string[]; authorId: string; forkedFromId?: string | null; extraTagIds?: string[] },
): Promise<void> {
  for (const c of new Set(p.categoryIds)) await recountCategory(tx, c);
  const res = await tx.execute<{ tag_id: string }>(sql`SELECT tag_id FROM prompt_tags WHERE prompt_id = ${p.promptId}`);
  const tagIds = [...new Set([...res.rows.map((r) => r.tag_id), ...(p.extraTagIds ?? [])])];
  await recountTags(tx, tagIds);
  await recountAuthor(tx, p.authorId);
  if (p.forkedFromId) await recountForks(tx, p.forkedFromId);
}

export async function recountPromptRatings(tx: Tx, promptId: string, globalMean: number, c: number): Promise<void> {
  await tx.execute(sql`
    UPDATE prompts SET
      rating_count = s.n, rating_sum = s.sum_stars, rating_weight_sum = s.w, rating_weighted_sum = s.ws,
      bayes_score = CASE WHEN ${c}::float8 + s.w > 0 THEN (${c}::float8 * ${globalMean}::float8 + s.ws) / (${c}::float8 + s.w) ELSE ${globalMean}::float8 END
    FROM (SELECT count(*)::int AS n, coalesce(sum(stars), 0)::int AS sum_stars,
                 coalesce(sum(weight), 0)::real AS w, coalesce(sum(weight * stars), 0)::real AS ws
          FROM ratings WHERE prompt_id = ${promptId}) s
    WHERE prompts.id = ${promptId}`);
}

export async function recountPromptSaves(tx: Tx, promptId: string): Promise<number> {
  const res = await tx.execute<{ save_count: number }>(sql`
    UPDATE prompts SET save_count = (SELECT count(*)::int FROM saves WHERE prompt_id = ${promptId})
    WHERE id = ${promptId} RETURNING save_count`);
  return Number(res.rows[0]?.save_count ?? 0);
}

export async function recountPromptComments(tx: Tx, promptId: string): Promise<void> {
  await tx.execute(sql`
    UPDATE prompts SET comment_count =
      (SELECT count(*)::int FROM comments WHERE prompt_id = ${promptId} AND status = 'visible')
    WHERE id = ${promptId}`);
}

/** open_report_count of a prompt counts reports that target the prompt itself. */
export async function recountOpenReports(tx: Tx, targetType: "prompt" | "comment", targetId: string): Promise<number> {
  const table = targetType === "prompt" ? sql`prompts` : sql`comments`;
  const res = await tx.execute<{ open_report_count: number }>(sql`
    UPDATE ${table} SET open_report_count =
      (SELECT count(*)::int FROM reports r WHERE r.target_type = ${targetType} AND r.target_id = ${targetId} AND r.status = 'open')
    WHERE id = ${targetId}::uuid RETURNING open_report_count`);
  return Number(res.rows[0]?.open_report_count ?? 0);
}
