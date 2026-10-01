/* eslint-disable @typescript-eslint/no-unused-vars */
// Foundation implements listCategories + getCategoryBySlug; data-read owns the rest.
import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { notImplemented } from "@/lib/errors";
import type { CategoryWithCount, TagSummary } from "@/lib/types";

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

export async function getTagBySlug(slug: string): Promise<TagSummary | null> {
  return notImplemented("getTagBySlug");
}
export async function listPopularTags(limit?: number): Promise<TagSummary[]> {
  return notImplemented("listPopularTags");
}
export async function suggestTags(prefix: string, limit?: number): Promise<TagSummary[]> {
  return notImplemented("suggestTags");
}
