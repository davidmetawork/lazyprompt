import { buildRss, type FeedItem } from "@/lib/seo/rss";
import { orFallbackAtBuild } from "@/server/build-fallback";
import { listPrompts } from "@/server/prompts/queries";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const map = (p: { title: string; slug: string; description: string; category: { name: string }; publishedAt: string | null; updatedAt: string }): FeedItem => ({
    title: p.title, slug: p.slug, description: p.description, category: p.category.name, publishedAt: p.publishedAt, updatedAt: p.updatedAt,
  });
  // Build without a database: empty channel. At runtime a DB error is rethrown so the last good ISR copy keeps being served.
  const items = await orFallbackAtBuild(async () => {
    const res = await listPrompts({ sort: "new", page: 1, pageSize: 48 });
    const out = res.items.slice(0, 50).map(map);
    if (res.hasMore && out.length < 50) {
      const more = await listPrompts({ sort: "new", page: 2, pageSize: 48 });
      out.push(...more.items.slice(0, 50 - out.length).map(map));
    }
    return out;
  }, [] as FeedItem[]);
  return new Response(buildRss(items), {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
