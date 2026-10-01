import { absoluteUrl } from "../base-url";
import { SITE_NAME, SITE_TAGLINE } from "../constants";

export interface FeedItem { title: string; slug: string; description: string; category: string; publishedAt: string | null; updatedAt: string }

export function escapeXml(s: string): string {
  return s
    // Strip characters that are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** RSS 2.0 channel. With no items it is still a valid (empty) channel. */
export function buildRss(items: FeedItem[], now: Date = new Date()): string {
  const newest = items.map((i) => new Date(i.publishedAt ?? i.updatedAt).getTime()).filter(Number.isFinite);
  const lastBuild = new Date(newest.length ? Math.max(...newest) : now.getTime()).toUTCString();
  const rows = items.map((i) => {
    const link = absoluteUrl(`/p/${i.slug}`);
    const date = new Date(i.publishedAt ?? i.updatedAt);
    return [
      "    <item>",
      `      <title>${escapeXml(i.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <description>${escapeXml(i.description)}</description>`,
      `      <pubDate>${(Number.isFinite(date.getTime()) ? date : now).toUTCString()}</pubDate>`,
      `      <category>${escapeXml(i.category)}</category>`,
      "    </item>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_NAME)}: newest prompts</title>`,
    `    <link>${escapeXml(absoluteUrl("/"))}</link>`,
    `    <description>${escapeXml(SITE_TAGLINE)}</description>`,
    "    <language>en</language>",
    `    <lastBuildDate>${lastBuild}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(absoluteUrl("/feed.xml"))}" rel="self" type="application/rss+xml" />`,
    ...rows,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
