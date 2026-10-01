import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seo/robots";

export const revalidate = 3600;

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
