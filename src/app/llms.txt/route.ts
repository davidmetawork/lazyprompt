import { buildLlmsTxt } from "@/lib/seo/llms";
import { orFallbackAtBuild } from "@/server/build-fallback";
import { listCategories } from "@/server/taxonomy";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  // Build without a database: buildLlmsTxt falls back to the static category list. At runtime a DB error is rethrown (keep the last ISR copy).
  const categories = await orFallbackAtBuild(() => listCategories(), [] as { slug: string; name: string }[]);
  return new Response(buildLlmsTxt(categories), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
