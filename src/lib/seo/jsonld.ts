// Minimal real implementation; the seo package owns this file afterwards (signatures frozen, section 22).
import type { PromptCard, PromptDetail } from "../types";
import { absoluteUrl } from "../base-url";
import { SITE_NAME } from "../constants";

const LICENSE_URL: Record<PromptDetail["license"], string> = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  cc_by_4: "https://creativecommons.org/licenses/by/4.0/",
};

export function promptJsonLd(p: PromptDetail): object[] {
  const creative: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: p.title,
    text: p.body,
    description: p.description,
    url: absoluteUrl(`/p/${p.slug}`),
    author: { "@type": "Person", name: p.author.name, url: absoluteUrl(`/u/${p.author.username}`) },
    datePublished: p.publishedAt ?? undefined,
    dateModified: p.updatedAt,
    keywords: p.tags.join(", "),
    genre: p.category.name,
    inLanguage: "en",
    license: LICENSE_URL[p.license],
    interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/UserInteraction", userInteractionCount: p.copyCount },
  };
  if (p.ratingCount >= 3 && p.ratingAvg !== null) {
    creative.aggregateRating = { "@type": "AggregateRating", ratingValue: p.ratingAvg, ratingCount: p.ratingCount, bestRating: 5, worstRating: 1 };
  }
  if (p.forkedFrom) creative.isBasedOn = absoluteUrl(`/p/${p.forkedFrom.slug}`);
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: p.category.name, item: absoluteUrl(`/c/${p.category.slug}`) },
      { "@type": "ListItem", position: 3, name: p.title, item: absoluteUrl(`/p/${p.slug}`) },
    ],
  };
  return [creative, breadcrumbs];
}

export function itemListJsonLd(items: PromptCard[], path: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url: absoluteUrl(path),
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem", position: i + 1, url: absoluteUrl(`/p/${p.slug}`), name: p.title,
    })),
  };
}

export function websiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/prompts")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}
