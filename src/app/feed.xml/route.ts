import { buildRss, type FeedItem } from "@/lib/seo/rss";
import { listPrompts } from "@/server/prompts/queries";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  let items: FeedItem[] = [];
  try {
    const res = await listPrompts({ sort: "new", page: 1, pageSize: 48 });
    items = res.items.slice(0, 50).map((p) => ({
      title: p.title, slug: p.slug, description: p.description, category: p.category.name,
      publishedAt: p.publishedAt, updatedAt: p.updatedAt,
    }));
    if (res.hasMore && items.length < 50) {
      const more = await listPrompts({ sort: "new", page: 2, pageSize: 48 });
      items.push(...more.items.slice(0, 50 - items.length).map((p) => ({
        title: p.title, slug: p.slug, description: p.description, category: p.category.name,
        publishedAt: p.publishedAt, updatedAt: p.updatedAt,
      })));
    }
  } catch {
    items = []; // empty channel instead of an error
  }
  return new Response(buildRss(items), {
    headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
