import type { MetadataRoute } from "next";
import { absoluteUrl } from "../base-url";

export const PRIVATE_PATHS = ["/admin", "/api", "/me", "/settings", "/submit", "/oauth", "/mcp"];

export function buildRobots(): MetadataRoute.Robots {
  const noindex = process.env.SEO_NOINDEX === "true";
  return {
    rules: noindex ? { userAgent: "*", disallow: "/" } : { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
