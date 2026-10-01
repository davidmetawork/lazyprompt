import { absoluteUrl } from "../base-url";
import { SITE_NAME, SITE_TAGLINE } from "../constants";

/** Static fallback when the database is unreachable at build or request time (mirrors content/categories.json). */
export const FALLBACK_CATEGORIES: { slug: string; name: string }[] = [
  { slug: "writing", name: "Writing" },
  { slug: "marketing-seo", name: "Marketing & SEO" },
  { slug: "coding", name: "Coding" },
  { slug: "data-analysis", name: "Data & Analysis" },
  { slug: "business-strategy", name: "Business & Strategy" },
  { slug: "research-learning", name: "Research & Learning" },
  { slug: "productivity", name: "Productivity" },
  { slug: "career", name: "Career" },
  { slug: "customer-support", name: "Customer Support" },
  { slug: "creative-fiction", name: "Creative & Fiction" },
  { slug: "personal-life", name: "Personal & Life" },
  { slug: "image-video", name: "Image & Video Gen" },
];

export function buildLlmsTxt(categories: { slug: string; name: string }[]): string {
  const cats = categories.length ? categories : FALLBACK_CATEGORIES;
  return [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_TAGLINE}`,
    "",
    `${SITE_NAME} is a free community library of AI prompts. People find a prompt, fill in its variables, and copy it or open it prefilled in ChatGPT, Claude, Grok or Perplexity. No account is needed to browse or copy. Signed-in members can submit, rate, comment on, save and fork prompts. ${SITE_NAME} never runs a model itself.`,
    "",
    "## How to use",
    "",
    `- Browse all prompts: ${absoluteUrl("/prompts")}`,
    `- Search: ${absoluteUrl("/prompts")}?q=your+query`,
    `- Each prompt lives at ${absoluteUrl("/p/<slug>")} with its template, variables, example output, ratings and comments.`,
    `- Newest prompts (RSS): ${absoluteUrl("/feed.xml")}`,
    `- Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
    "## Categories",
    "",
    ...cats.map((c) => `- [${c.name}](${absoluteUrl(`/c/${c.slug}`)})`),
    "",
    "## ChatGPT and Claude app",
    "",
    `- Use LazyPrompt directly inside ChatGPT or Claude through the MCP connector: ${absoluteUrl("/apps")}`,
    "",
    "## Policies",
    "",
    `- [About](${absoluteUrl("/about")})`,
    `- [Content guidelines](${absoluteUrl("/guidelines")})`,
    `- [Privacy](${absoluteUrl("/privacy")})`,
    `- [Terms](${absoluteUrl("/terms")})`,
    "",
  ].join("\n");
}
