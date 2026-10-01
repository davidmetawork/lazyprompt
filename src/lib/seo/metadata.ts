import type { Metadata } from "next";
import { SITE_NAME } from "../constants";
import { absoluteUrl } from "../base-url";

const MAX_TITLE = 60;
const MAX_DESCRIPTION = 160;

/** Cuts `text` to at most `max` chars at a word boundary, adding an ellipsis when it had to cut. */
export function truncateAtWord(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > max * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s,;:.\-–—]+$/, "")}…`;
}

/** "<title> | LazyPrompt", at most 60 characters in total (the title is shortened, never the brand). */
export function formatTitle(title: string): string {
  const suffix = ` | ${SITE_NAME}`;
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return SITE_NAME;
  return `${truncateAtWord(clean, MAX_TITLE - suffix.length)}${suffix}`;
}

export function buildMetadata(input: {
  title: string; description: string; path: string; noindex?: boolean; ogImage?: string; type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(input.path.split(/[?#]/)[0] || "/");
  const title = formatTitle(input.title);
  const description = truncateAtWord(input.description, MAX_DESCRIPTION);
  const noindex = input.noindex === true || process.env.SEO_NOINDEX === "true";
  // Without an explicit image, the route's colocated opengraph-image file convention supplies og:image and twitter:image.
  const images = input.ogImage ? [{ url: input.ogImage }] : undefined;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title, description, url, siteName: SITE_NAME, type: input.type ?? "website", images },
    twitter: { card: "summary_large_image", title, description, images: images?.map((i) => i.url) },
  };
}
