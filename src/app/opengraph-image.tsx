import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { BrandCard, loadOgFonts, OG_SIZE } from "@/lib/seo/og";

export const revalidate = 3600;
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${SITE_NAME}: ${SITE_TAGLINE}`;

export default async function Image() {
  return new ImageResponse(<BrandCard />, { ...OG_SIZE, fonts: await loadOgFonts() });
}
