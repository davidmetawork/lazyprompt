import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { listSitemapEntries } from "@/server/prompts/queries";
import { listCategories, listTagsForSitemap } from "@/server/taxonomy";

// Prerendered at build and refreshed hourly.
export const revalidate = 3600;

/**
 * Only the production build (which may run without a reachable database) degrades to the static entries. At runtime a
 * database error is rethrown so the last good ISR copy keeps being served instead of caching a degraded sitemap for an hour.
 */
async function load<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (process.env.NEXT_PHASE === "phase-production-build") return fallback;
    throw e;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, tags, prompts] = await Promise.all([
    load(() => listCategories(), []),
    load(() => listTagsForSitemap(), []),
    load(() => listSitemapEntries(), []),
  ]);
  return buildSitemap({ categories, tags, prompts });
}
