import { buildLlmsTxt } from "@/lib/seo/llms";
import { listCategories } from "@/server/taxonomy";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  let categories: { slug: string; name: string }[] = [];
  try {
    categories = await listCategories();
  } catch {
    categories = []; // buildLlmsTxt falls back to the static category list
  }
  return new Response(buildLlmsTxt(categories), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
