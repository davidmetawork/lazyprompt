import { notFound, permanentRedirect } from "next/navigation";
import { Container } from "@/components/layout/container";
import { FiltersBar } from "@/components/prompt/filters-bar";
import { parseBrowseParams } from "@/components/prompt/browse-params";
import { PromptResults } from "@/components/prompt/prompt-results";
import { safely, scheduleRankingRecompute } from "@/components/prompt/safe";
import { buildMetadata } from "@/lib/seo/metadata";
import { listPrompts } from "@/server/prompts/queries";
import { getTagBySlug, listCategories } from "@/server/taxonomy";

const MIN_INDEXABLE = 5;

// getTagBySlug resolves aliases to the canonical tag. It may still be a stub in-branch, hence safely().
async function resolveTag(slug: string) {
  const tag = await safely(() => getTagBySlug(slug));
  return tag;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/t/[tag]">) {
  const { tag: slug } = await params;
  const tag = await resolveTag(slug);
  const { state } = parseBrowseParams(await searchParams);
  const name = tag?.name ?? slug;
  return buildMetadata({
    title: `${name} AI prompts`,
    description: `Free, community-rated AI prompts tagged ${name}. Fill in the blanks and copy into ChatGPT, Claude and more.`,
    path: `/t/${tag?.slug ?? slug}`,
    noindex: !tag || tag.promptCount < MIN_INDEXABLE || Boolean(state.q || state.category || state.model || state.use || state.sort),
  });
}

export default async function TagPage({ params, searchParams }: PageProps<"/t/[tag]">) {
  const { tag: slug } = await params;
  const sp = await searchParams;
  const tag = await resolveTag(slug);
  if (tag && tag.slug !== slug) permanentRedirect(`/t/${tag.slug}`);
  scheduleRankingRecompute();

  const { state, input } = parseBrowseParams(sp);
  const [result, categories] = await Promise.all([listPrompts({ ...input, tag: tag?.slug ?? slug }), listCategories()]);
  // Without the taxonomy read (in-branch stub) an empty unscoped result is treated as an unknown tag.
  if (!tag && result.total === 0 && !state.q && !state.category && !state.model && !state.use) notFound();

  const name = tag?.name ?? slug;
  const path = `/t/${tag?.slug ?? slug}`;
  const scoped = { ...state, tag: tag?.slug ?? slug };

  return (
    <Container className="py-8 sm:py-10">
      <header>
        <p className="text-sm font-medium text-primary">Tag</p>
        <h1 className="text-3xl font-semibold tracking-tight">#{name}</h1>
        <p className="mt-2 text-muted-foreground">
          {tag ? `${tag.promptCount} ${tag.promptCount === 1 ? "prompt" : "prompts"}` : `${result.total} prompts`} tagged {name}.
        </p>
      </header>
      <div className="mt-6 grid gap-6">
        <FiltersBar basePath={path} state={scoped} categories={categories} fixed={["tag"]} />
        <PromptResults
          result={result} basePath={path} searchParams={sp} categories={categories}
          hasFilters={Boolean(state.category || state.model || state.use)} query={state.q} track={Boolean(state.q)}
        />
      </div>
    </Container>
  );
}
