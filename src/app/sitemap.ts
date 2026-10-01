import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/seo/sitemap";
import { listPrompts, listSitemapEntries } from "@/server/prompts/queries";
import { listCategories, listPopularTags } from "@/server/taxonomy";

// Prerendered at build and refreshed hourly. Every data call degrades to the static entries (build safety).
export const revalidate = 3600;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function promptEntries(): Promise<{ slug: string; updatedAt: string }[]> {
  try {
    return await listSitemapEntries();
  } catch {
    // listSitemapEntries unavailable (or failing): fall back to paging the public list, and to nothing if that fails too.
    return safe(async () => {
      const out: { slug: string; updatedAt: string }[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await listPrompts({ sort: "new", page, pageSize: 48 });
        out.push(...res.items.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })));
        if (!res.hasMore) break;
      }
      return out;
    }, []);
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, tags, prompts] = await Promise.all([
    safe(() => listCategories(), []),
    safe(() => listPopularTags(500), []),
    promptEntries(),
  ]);
  return buildSitemap({ categories, tags, prompts });
}
