import Link from "next/link";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { listPopularTags } from "@/server/taxonomy";
import type { CategoryWithCount, Paginated, PromptCard } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SearchParams } from "./browse-params";
import { PromptGrid } from "./prompt-grid";
import { SearchTracker } from "./search-tracker";
import { safely } from "./safe";

/** Count line, grid (or empty state with suggestions) and pager for a browse listing. */
export async function PromptResults({
  result, basePath, searchParams, categories, hasFilters, query, track,
}: {
  result: Paginated<PromptCard>;
  basePath: string;
  searchParams: SearchParams;
  categories: CategoryWithCount[];
  hasFilters: boolean;
  query?: string;
  track?: boolean;
}) {
  const { items, total, page, pageSize } = result;
  const noun = total === 1 ? "prompt" : "prompts";

  if (items.length === 0) {
    const tags = (await safely(() => listPopularTags(8))) ?? [];
    return (
      <div className="grid gap-6">
        {track ? <SearchTracker results={0} hasFilters={hasFilters} /> : null}
        <EmptyState
          icon={<SearchX className="size-8" aria-hidden="true" />}
          title={query ? `No prompts match "${query}"` : "No prompts found"}
          description="Try fewer filters, check the spelling, or browse a category below."
          action={hasFilters || query ? (
            <Link href={basePath} className={buttonVariants({ variant: "outline" })}>Clear filters</Link>
          ) : undefined}
        />
        <div className="grid gap-3 text-sm">
          <p className="font-medium">Browse by category</p>
          <ul className="flex flex-wrap gap-2">
            {categories.slice(0, 12).map((c) => (
              <li key={c.slug}>
                <Link href={`/c/${c.slug}`} className="inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium hover:bg-muted">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
          {tags.length > 0 ? (
            <>
              <p className="mt-2 font-medium">Popular tags</p>
              <ul className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/t/${t.slug}`} className="inline-flex h-7 items-center rounded-full bg-secondary px-3 text-xs font-medium hover:bg-accent">
                      #{t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      {track ? <SearchTracker results={total} hasFilters={hasFilters} /> : null}
      <p className={cn("mb-4 text-sm text-muted-foreground")} aria-live="polite" data-testid="result-count">
        {total.toLocaleString("en-US")} {noun}
        {query ? <> for <span className="font-medium text-foreground">&ldquo;{query}&rdquo;</span></> : null}
      </p>
      <PromptGrid prompts={items} />
      <PaginationLinks basePath={basePath} searchParams={searchParams} page={page} pageSize={pageSize} total={total} />
    </div>
  );
}
