import { Container } from "@/components/layout/container";
import { FiltersBar } from "@/components/prompt/filters-bar";
import { hasIndexBlockingFilters, parseBrowseParams } from "@/components/prompt/browse-params";
import { PromptResults } from "@/components/prompt/prompt-results";
import { scheduleRankingRecompute } from "@/components/prompt/safe";
import { buildMetadata } from "@/lib/seo/metadata";
import { listPrompts } from "@/server/prompts/queries";
import { listCategories } from "@/server/taxonomy";

export async function generateMetadata({ searchParams }: PageProps<"/prompts">) {
  const { state } = parseBrowseParams(await searchParams);
  const title = state.q ? `Search: ${state.q.slice(0, 50)}` : "Browse AI prompts";
  return buildMetadata({
    title,
    description: state.q
      ? `AI prompts matching "${state.q.slice(0, 80)}". Free, community-rated, ready to copy into ChatGPT, Claude and more.`
      : "Browse free, community-rated AI prompts. Filter by category, model and use case, fill in the blanks and copy.",
    path: "/prompts",
    noindex: hasIndexBlockingFilters(state),
  });
}

export default async function PromptsPage({ searchParams }: PageProps<"/prompts">) {
  scheduleRankingRecompute();
  const sp = await searchParams;
  const { state, input } = parseBrowseParams(sp);
  const [result, categories] = await Promise.all([listPrompts(input), listCategories()]);
  const hasFilters = Boolean(state.category || state.tag || state.model || state.use);

  return (
    <Container className="py-8 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">
        {state.q ? <>Results for &ldquo;{state.q}&rdquo;</> : "Browse prompts"}
      </h1>
      <p className="mt-2 text-muted-foreground">Free, community-rated prompts. Fill in the blanks, copy, done.</p>
      <div className="mt-6 grid gap-6">
        <FiltersBar basePath="/prompts" state={state} categories={categories} />
        <PromptResults
          result={result} basePath="/prompts" searchParams={sp} categories={categories}
          hasFilters={hasFilters} query={state.q} track={Boolean(state.q)}
        />
      </div>
    </Container>
  );
}
