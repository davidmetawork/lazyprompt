import "server-only";
import { sql } from "drizzle-orm";
import { categories, profiles, prompts, user } from "@/db/schema";
import type {
  AiModel, AuthorSummary, License, PromptCard, PromptDetail, PromptStatus, UseCase, VariableDef,
} from "@/lib/types";

/**
 * Drizzle select shape shared by every PromptCard-returning query. Callers must
 *   .from(prompts).innerJoin(categories, eq(categories.id, prompts.categoryId))
 *   .innerJoin(user, eq(user.id, prompts.authorId)).leftJoin(profiles, eq(profiles.userId, user.id))
 * Tags and models are aggregated by correlated subqueries (text[]; enum arrays are cast to text so node-pg parses them).
 */
export const promptCardColumns = {
  id: prompts.id,
  shortId: prompts.shortId,
  slug: prompts.slug,
  title: prompts.title,
  description: prompts.description,
  useCase: prompts.useCase,
  ratingCount: prompts.ratingCount,
  ratingSum: prompts.ratingSum,
  copyCount: prompts.copyCount,
  saveCount: prompts.saveCount,
  commentCount: prompts.commentCount,
  variableCount: sql<number>`jsonb_array_length(${prompts.variables})::int`,
  isFeatured: prompts.isFeatured,
  publishedAt: prompts.publishedAt,
  updatedAt: prompts.updatedAt,
  categorySlug: categories.slug,
  categoryName: categories.name,
  tags: sql<string[]>`coalesce((select array_agg(t.name order by t.name) from prompt_tags pt join tags t on t.id = pt.tag_id where pt.prompt_id = ${prompts.id}), '{}'::text[])`,
  models: sql<AiModel[]>`coalesce((select array_agg(pm.model::text order by pm.model::text) from prompt_models pm where pm.prompt_id = ${prompts.id}), '{}'::text[])`,
  authorId: user.id,
  authorUsername: profiles.username,
  authorName: user.name,
  authorImage: user.image,
  authorIsSystem: profiles.isSystem,
};

/** Extra columns for the detail page (spread after promptCardColumns). */
export const promptDetailColumns = {
  ...promptCardColumns,
  body: prompts.body,
  variables: prompts.variables,
  exampleOutput: prompts.exampleOutput,
  notes: prompts.notes,
  license: prompts.license,
  version: prompts.version,
  status: prompts.status,
  openCount: prompts.openCount,
  workedCount: prompts.workedCount,
  notWorkedCount: prompts.notWorkedCount,
  forkCount: prompts.forkCount,
  moderationFlags: prompts.moderationFlags,
  moderationNote: prompts.moderationNote,
  createdAt: prompts.createdAt,
};

export interface PromptCardRow {
  id: string; shortId: string; slug: string; title: string; description: string; useCase: UseCase;
  ratingCount: number; ratingSum: number; copyCount: number; saveCount: number; commentCount: number;
  variableCount: number; isFeatured: boolean; publishedAt: Date | null; updatedAt: Date;
  categorySlug: string; categoryName: string; tags: string[]; models: AiModel[];
  authorId: string; authorUsername: string | null; authorName: string; authorImage: string | null;
  authorIsSystem: boolean | null;
}

export interface PromptDetailRow extends PromptCardRow {
  body: string; variables: VariableDef[]; exampleOutput: string | null; notes: string | null; license: License;
  version: number; status: PromptStatus; openCount: number; workedCount: number; notWorkedCount: number;
  forkCount: number; moderationFlags: string[]; moderationNote: string | null; createdAt: Date;
}

export interface PromptDetailExtras {
  tags: string[];
  models: AiModel[];
  testedOn: PromptDetail["testedOn"];
  forkedFrom: PromptDetail["forkedFrom"];
}

export function toAuthorSummary(r: {
  authorId: string; authorUsername: string | null; authorName: string; authorImage: string | null; authorIsSystem: boolean | null;
}): AuthorSummary {
  return {
    id: r.authorId,
    username: r.authorUsername ?? "",
    name: r.authorName,
    image: r.authorImage,
    isSystem: r.authorIsSystem ?? false,
  };
}

export function ratingAverage(ratingSum: number, ratingCount: number): number | null {
  return ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 100) / 100 : null;
}

export function toPromptCard(row: PromptCardRow): PromptCard {
  return {
    id: row.id,
    shortId: row.shortId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: { slug: row.categorySlug, name: row.categoryName },
    tags: row.tags ?? [],
    models: row.models ?? [],
    useCase: row.useCase,
    author: toAuthorSummary(row),
    ratingAvg: ratingAverage(row.ratingSum, row.ratingCount),
    ratingCount: row.ratingCount,
    copyCount: row.copyCount,
    saveCount: row.saveCount,
    commentCount: row.commentCount,
    variableCount: row.variableCount,
    isFeatured: row.isFeatured,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** `includeNonPublic` marks an author/admin caller: only then are moderation flags and note exposed. */
export function toPromptDetail(
  row: PromptDetailRow,
  extras: PromptDetailExtras,
  opts: { includeNonPublic: boolean },
): PromptDetail {
  const card = toPromptCard({ ...row, tags: extras.tags, models: extras.models });
  return {
    ...card,
    body: row.body,
    variables: row.variables ?? [],
    exampleOutput: row.exampleOutput,
    notes: row.notes,
    license: row.license,
    version: row.version,
    status: row.status,
    openCount: row.openCount,
    workedCount: row.workedCount,
    notWorkedCount: row.notWorkedCount,
    forkCount: row.forkCount,
    testedOn: extras.testedOn,
    forkedFrom: extras.forkedFrom,
    moderationFlags: opts.includeNonPublic ? (row.moderationFlags ?? []) : [],
    moderationNote: opts.includeNonPublic ? row.moderationNote : null,
    createdAt: row.createdAt.toISOString(),
  };
}
