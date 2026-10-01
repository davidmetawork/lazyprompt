import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/constants";
import { parseShortIdFromSlug } from "@/lib/slug";
import { BrandCard, loadOgFonts, OG_SIZE, PromptCard } from "@/lib/seo/og";
import { getPromptByShortId } from "@/server/prompts/queries";

export const revalidate = 3600;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${SITE_NAME} prompt`;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fonts = await loadOgFonts();
  let prompt = null;
  let dbError = false;
  try {
    const shortId = parseShortIdFromSlug(slug);
    prompt = shortId ? await getPromptByShortId(shortId) : null;
  } catch {
    dbError = true; // DB error: serve the brand card rather than a broken image
  }
  // Unknown, unpublished or removed prompts are a 404, not a 200 image that crawlers would index.
  if (!prompt && !dbError) notFound();
  return new ImageResponse(
    prompt
      ? <PromptCard title={prompt.title} category={prompt.category.name} ratingAvg={prompt.ratingAvg} ratingCount={prompt.ratingCount} />
      : <BrandCard />,
    { ...OG_SIZE, fonts },
  );
}
