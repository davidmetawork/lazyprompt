// Categories and tags (ARCHITECTURE.md sections 3, 5, 7).
import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, tags } from "@/db/schema";
import type { CategoryWithCount, TagSummary } from "@/lib/types";
import { escapeLike } from "@/server/search/like";

const categoryColumns = {
  id: categories.id, slug: categories.slug, name: categories.name, description: categories.description,
  icon: categories.icon, promptCount: categories.promptCount,
};

export const listCategories: () => Promise<CategoryWithCount[]> = cache(async () =>
  db.select(categoryColumns).from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)));

export async function getCategoryBySlug(slug: string): Promise<CategoryWithCount | null> {
  const [row] = await db.select(categoryColumns).from(categories).where(eq(categories.slug, slug)).limit(1);
  return row ?? null;
}

const clamp = (n: number | undefined, def: number, max: number) => Math.min(Math.max(Math.trunc(n ?? def) || def, 1), max);

/** Lowercase, spaces to dashes, drop everything but [a-z0-9-]. Keeps prefixes like "ema" or "code-" intact (unlike normalizeTag). */
function slugPrefix(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 32);
}

/** A tag by slug; an alias resolves to its canonical tag (the returned slug/name/count are the canonical ones). */
export async function getTagBySlug(slug: string): Promise<TagSummary | null> {
  const s = slugPrefix(slug);
  if (!s) return null;
  const res = await db.execute<{ slug: string; name: string; prompt_count: number }>(sql`
    SELECT c.slug, c.name, c.prompt_count
    FROM tags t JOIN tags c ON c.id = coalesce(t.alias_of_id, t.id)
    WHERE t.slug = ${s}
    LIMIT 1
  `);
  const r = res.rows[0];
  return r ? { slug: r.slug, name: r.name, promptCount: Number(r.prompt_count) } : null;
}

/** Canonical (non-alias) tags in use, most used first. Default 30, max 100. */
export async function listPopularTags(limit?: number): Promise<TagSummary[]> {
  return db
    .select({ slug: tags.slug, name: tags.name, promptCount: tags.promptCount })
    .from(tags)
    .where(and(isNull(tags.aliasOfId), gt(tags.promptCount, 0)))
    .orderBy(desc(tags.promptCount), asc(tags.slug))
    .limit(clamp(limit, 30, 100));
}

/**
 * Autocomplete: `slug % q OR slug LIKE q||'%'`, ordered by prompt_count, default and max-useful limit 8 (cap 20).
 * Alias matches resolve to their canonical tag (deduplicated).
 */
export async function suggestTags(prefix: string, limit?: number): Promise<TagSummary[]> {
  const q = slugPrefix(prefix);
  if (!q) return [];
  const like = `${escapeLike(q)}%`;
  const res = await db.execute<{ slug: string; name: string; prompt_count: number }>(sql`
    SELECT c.slug, c.name, c.prompt_count
    FROM tags c
    WHERE c.id IN (
      SELECT coalesce(t.alias_of_id, t.id) FROM tags t WHERE t.slug % ${q}::text OR t.slug LIKE ${like}
    )
    ORDER BY c.prompt_count DESC, c.slug ASC
    LIMIT ${clamp(limit, 8, 20)}
  `);
  return res.rows.map((r) => ({ slug: r.slug, name: r.name, promptCount: Number(r.prompt_count) }));
}
