import type { MetadataRoute } from "next";
import { absoluteUrl } from "../base-url";

export const STATIC_PATHS = ["/", "/prompts", "/apps", "/about", "/guidelines", "/privacy", "/terms"];
/** Sitemaps allow 50k URLs per file; generateSitemaps splitting is a follow-up (see the package report). */
export const MAX_SITEMAP_URLS = 50_000;
export const MIN_TAG_PROMPTS = 5;

export function buildSitemap(input: {
  categories: { slug: string }[];
  tags: { slug: string; promptCount: number }[];
  prompts: { slug: string; updatedAt: string }[];
}): MetadataRoute.Sitemap {
  const out: MetadataRoute.Sitemap = [
    ...STATIC_PATHS.map((p) => ({ url: absoluteUrl(p), changeFrequency: "weekly" as const, priority: p === "/" ? 1 : 0.5 })),
    ...input.categories.map((c) => ({ url: absoluteUrl(`/c/${c.slug}`), changeFrequency: "daily" as const, priority: 0.8 })),
    ...input.tags.filter((t) => t.promptCount >= MIN_TAG_PROMPTS)
      .map((t) => ({ url: absoluteUrl(`/t/${t.slug}`), changeFrequency: "weekly" as const, priority: 0.4 })),
    ...input.prompts.map((p) => {
      const d = new Date(p.updatedAt);
      return { url: absoluteUrl(`/p/${p.slug}`), lastModified: Number.isFinite(d.getTime()) ? d : undefined, changeFrequency: "weekly" as const, priority: 0.7 };
    }),
  ];
  return out.slice(0, MAX_SITEMAP_URLS);
}
