import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { CategoryIcon } from "@/components/prompt/category-icon";
import { FiltersBar } from "@/components/prompt/filters-bar";
import { parseBrowseParams } from "@/components/prompt/browse-params";
import { PromptResults } from "@/components/prompt/prompt-results";
import { scheduleRankingRecompute } from "@/components/prompt/safe";
import { JsonLd } from "@/components/seo/json-ld";
import { itemListJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { listPrompts } from "@/server/prompts/queries";
import { getCategoryBySlug, listCategories } from "@/server/taxonomy";

export async function generateMetadata({ params, searchParams }: PageProps<"/c/[category]">) {
  const { category } = await params;
  const cat = await getCategoryBySlug(category);
  if (!cat) return { title: "Category not found", robots: { index: false } };
  const { state } = parseBrowseParams(await searchParams);
  return buildMetadata({
    title: `${cat.name} AI prompts`,
    description: cat.description,
    path: `/c/${cat.slug}`,
    noindex: Boolean(state.q || state.model || state.use || state.sort || state.tag),
  });
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[category]">) {
  const { category } = await params;
  const sp = await searchParams;
  const cat = await getCategoryBySlug(category);
  if (!cat) notFound();
  scheduleRankingRecompute();

  const { state, input } = parseBrowseParams(sp);
  const scoped = { ...state, category: cat.slug };
  const [result, categories] = await Promise.all([listPrompts({ ...input, category: cat.slug }), listCategories()]);
  const path = `/c/${cat.slug}`;

  return (
    <Container className="py-8 sm:py-10">
      <JsonLd data={itemListJsonLd(result.items, path)} />
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <CategoryIcon name={cat.icon} className="size-6" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{cat.name}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{cat.description}</p>
        </div>
      </header>
      <div className="mt-6 grid gap-6">
        <FiltersBar basePath={path} state={scoped} categories={categories} fixed={["category"]} />
        <PromptResults
          result={result} basePath={path} searchParams={sp} categories={categories}
          hasFilters={Boolean(state.model || state.use)} query={state.q} track={Boolean(state.q)}
        />
      </div>
    </Container>
  );
}
