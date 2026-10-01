// SQL building blocks for listPrompts (ARCHITECTURE.md section 5). Everything user-supplied is a bound parameter.
import "server-only";
import { and, eq, exists, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, promptModels, prompts } from "@/db/schema";
import type { AiModel, UseCase } from "@/lib/types";
import { escapeLike } from "./like";

export interface PromptFilters {
  category?: string;
  tag?: string;
  model?: AiModel;
  useCase?: UseCase;
  authorId?: string;
}

/** ANDed filters for published prompts. Requires `categories` to be joined by the caller. */
export function filterConditions(f: PromptFilters): SQL[] {
  const conds: SQL[] = [eq(prompts.status, "published")];
  if (f.category) conds.push(eq(categories.slug, f.category));
  if (f.useCase) conds.push(eq(prompts.useCase, f.useCase));
  if (f.authorId) conds.push(eq(prompts.authorId, f.authorId));
  if (f.model) {
    // "any model" prompts (no prompt_models rows) match every model filter.
    conds.push(or(
      exists(db.select({ x: sql`1` }).from(promptModels)
        .where(and(eq(promptModels.promptId, prompts.id), eq(promptModels.model, f.model)))),
      sql`not exists (select 1 from prompt_models pm0 where pm0.prompt_id = ${prompts.id})`,
    )!);
  }
  if (f.tag) {
    // Resolve through alias_of_id: prompts tagged with the canonical tag or with any alias of it.
    const slug = f.tag.trim().toLowerCase();
    conds.push(sql`exists (
      select 1 from prompt_tags pt
      join tags t on t.id = pt.tag_id
      where pt.prompt_id = ${prompts.id}
        and coalesce(t.alias_of_id, t.id) = (select coalesce(t2.alias_of_id, t2.id) from tags t2 where t2.slug = ${slug} limit 1)
    )`);
  }
  return conds;
}

const tsq = (q: string) => sql`websearch_to_tsquery('english', ${q}::text)`;

/**
 * Match predicate: full-text OR title trigram OR escaped title ILIKE. A stopword-only query yields an empty tsquery
 * (numnode = 0), which is skipped explicitly so the trigram/ILIKE branches carry the search.
 */
export function matchCondition(q: string): SQL {
  // websearch operators (quoted phrase, -exclusion, "or") are honoured only by the full-text branch; the fuzzy
  // branches would otherwise re-admit the very rows the operator excludes.
  if (/"|(^|\s)-\S|\sor\s/i.test(q)) return sql`(numnode(${tsq(q)}) > 0 AND ${prompts.search} @@ ${tsq(q)})`;
  const like = `%${escapeLike(q)}%`;
  return sql`((numnode(${tsq(q)}) > 0 AND ${prompts.search} @@ ${tsq(q)}) OR ${prompts.title} % ${q}::text OR ${prompts.title} ILIKE ${like})`;
}

/** ts_rank_cd(search, tsq, 32) + 0.3 * similarity(title, q) + 0.02 * bayes_score (0 rank contribution from an empty tsquery). */
export function rankExpression(q: string): SQL.Aliased<number> {
  return sql<number>`(ts_rank_cd(${prompts.search}, ${tsq(q)}, 32) + 0.3 * similarity(${prompts.title}, ${q}::text) + 0.02 * ${prompts.bayesScore})::float8`.as("rank");
}

/** Category/tag helper used by `count` fallbacks: the same predicate list as the page query. */
export function allOf(conds: SQL[]): SQL {
  return and(...conds)!;
}
