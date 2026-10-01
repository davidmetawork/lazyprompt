// Tag lookup/upsert used by prompt mutations. Private to src/server/prompts (owned by data-write).
import "server-only";
import { eq } from "drizzle-orm";
import type { Tx } from "@/db";
import { tags } from "@/db/schema";
import { labelFromKey } from "@/lib/template";

export interface ResolvedTag { id: string; slug: string; name: string }

const MAX_ALIAS_HOPS = 5;

/**
 * Resolves already-normalized tag slugs to tag rows: unknown slugs are created, aliases are followed through
 * `alias_of_id` to the canonical tag. The result is de-duplicated by tag id and keeps input order.
 */
export async function resolveTags(tx: Tx, slugs: string[]): Promise<ResolvedTag[]> {
  const out: ResolvedTag[] = [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    let [row] = await tx.select({ id: tags.id, slug: tags.slug, name: tags.name, aliasOfId: tags.aliasOfId })
      .from(tags).where(eq(tags.slug, slug)).limit(1);
    if (!row) {
      await tx.insert(tags).values({ slug, name: labelFromKey(slug).slice(0, 32) }).onConflictDoNothing({ target: tags.slug });
      [row] = await tx.select({ id: tags.id, slug: tags.slug, name: tags.name, aliasOfId: tags.aliasOfId })
        .from(tags).where(eq(tags.slug, slug)).limit(1);
    }
    for (let hop = 0; row && row.aliasOfId && hop < MAX_ALIAS_HOPS; hop++) {
      const [canonical] = await tx.select({ id: tags.id, slug: tags.slug, name: tags.name, aliasOfId: tags.aliasOfId })
        .from(tags).where(eq(tags.id, row.aliasOfId)).limit(1);
      if (!canonical) break;
      row = canonical;
    }
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, slug: row.slug, name: row.name });
  }
  return out;
}
