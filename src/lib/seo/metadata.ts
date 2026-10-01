// Minimal real implementation; the seo package owns this file afterwards (signature frozen, section 22).
import type { Metadata } from "next";
import { SITE_NAME } from "../constants";
import { absoluteUrl } from "../base-url";

export function buildMetadata(input: {
  title: string; description: string; path: string; noindex?: boolean; ogImage?: string; type?: "website" | "article";
}): Metadata {
  const url = absoluteUrl(input.path.split("?")[0] ?? "/");
  const noindex = input.noindex || process.env.SEO_NOINDEX === "true";
  const images = input.ogImage ? [{ url: input.ogImage }] : undefined;
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: url },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: input.title, description: input.description, url, siteName: SITE_NAME, type: input.type ?? "website", images },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images: images?.map((i) => i.url) },
  };
}
