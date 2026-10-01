import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { orFallbackAtBuild } from "@/server/build-fallback";
import { listSitemapEntries } from "@/server/prompts/queries";
import { listCategories, listTagsForSitemap } from "@/server/taxonomy";

// Prerendered at build and refreshed hourly. Only the build degrades to the static entries; see orFallbackAtBuild.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, tags, prompts] = await Promise.all([
    orFallbackAtBuild(() => listCategories(), []),
    orFallbackAtBuild(() => listTagsForSitemap(), []),
    orFallbackAtBuild(() => listSitemapEntries(), []),
  ]);
  return buildSitemap({ categories, tags, prompts });
}
