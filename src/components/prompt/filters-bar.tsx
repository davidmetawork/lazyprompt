import Link from "next/link";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AI_MODELS, USE_CASES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { CategoryWithCount, SortKey } from "@/lib/types";
import { buildBrowseHref, effectiveSort, type BrowseState } from "./browse-params";
import { modelName, labelForUseCase } from "./labels";

const SORT_LABELS: Record<SortKey, string> = { relevance: "Relevance", top: "Top rated", trending: "Trending", new: "Newest" };

const selectCls =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type FixedKey = keyof BrowseState;

/**
 * Pure URL-state filters: a GET form (works without JS), sort tabs and removable chips are all plain links.
 * `fixed` keys belong to the page (e.g. category on /c/[category]) and are neither shown nor emitted.
 */
export function FiltersBar({
  basePath, state, categories, fixed = [],
}: {
  basePath: string;
  state: BrowseState;
  categories: CategoryWithCount[];
  fixed?: FixedKey[];
}) {
  const sort = effectiveSort(state);
  const sorts: SortKey[] = state.q ? ["relevance", "top", "trending", "new"] : ["top", "trending", "new"];
  const defaultSort = state.q ? "relevance" : "top";
  const hrefFor = (patch: Parameters<typeof buildBrowseHref>[2]) => buildBrowseHref(basePath, state, { page: null, ...patch }, fixed);

  const chips: { label: string; removeHref: string }[] = [];
  if (state.q && !fixed.includes("q")) chips.push({ label: `Search: ${state.q}`, removeHref: hrefFor({ q: null }) });
  if (state.category && !fixed.includes("category")) {
    const name = categories.find((c) => c.slug === state.category)?.name ?? state.category;
    chips.push({ label: `Category: ${name}`, removeHref: hrefFor({ category: null }) });
  }
  if (state.tag && !fixed.includes("tag")) chips.push({ label: `Tag: ${state.tag}`, removeHref: hrefFor({ tag: null }) });
  if (state.model && !fixed.includes("model")) {
    chips.push({ label: `Model: ${modelName(state.model as (typeof AI_MODELS)[number])}`, removeHref: hrefFor({ model: null }) });
  }
  if (state.use && !fixed.includes("use")) {
    chips.push({ label: `Use case: ${labelForUseCase(state.use)}`, removeHref: hrefFor({ use: null }) });
  }

  return (
    <div className="grid gap-4" data-testid="filters-bar">
      <form action={basePath} method="get" role="search" aria-label="Filter prompts"
        className="grid gap-3 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        {state.sort && state.sort !== defaultSort ? <input type="hidden" name="sort" value={state.sort} /> : null}
        {state.tag && !fixed.includes("tag") ? <input type="hidden" name="tag" value={state.tag} /> : null}
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor="filter-q" className="text-xs font-medium text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input id="filter-q" name="q" type="search" maxLength={200} defaultValue={state.q ?? ""} placeholder="Search prompts"
              className={cn(selectCls, "pl-8")} />
          </div>
        </div>
        {fixed.includes("category") ? null : (
          <div className="grid gap-1.5">
            <label htmlFor="filter-category" className="text-xs font-medium text-muted-foreground">Category</label>
            <select id="filter-category" name="category" defaultValue={state.category ?? ""} className={selectCls}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-1.5">
          <label htmlFor="filter-model" className="text-xs font-medium text-muted-foreground">Model</label>
          <select id="filter-model" name="model" defaultValue={state.model ?? ""} className={selectCls}>
            <option value="">Any model</option>
            {AI_MODELS.map((m) => <option key={m} value={m}>{modelName(m)}</option>)}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="filter-use" className="text-xs font-medium text-muted-foreground">Use case</label>
          <select id="filter-use" name="use" defaultValue={state.use ?? ""} className={selectCls}>
            <option value="">Any use case</option>
            {USE_CASES.map((u) => <option key={u} value={u}>{labelForUseCase(u)}</option>)}
          </select>
        </div>
        <Button type="submit" size="lg" className="h-9">Apply filters</Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Sort" className="inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {sorts.map((s) => (
            <Link key={s} href={hrefFor({ sort: s === defaultSort ? null : s })} aria-current={s === sort ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
                s === sort && "bg-background text-foreground shadow-xs",
              )}>
              {SORT_LABELS[s]}
            </Link>
          ))}
        </nav>
        {chips.length > 0 ? (
          <ul className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            {chips.map((c) => (
              <li key={c.label}>
                <Link href={c.removeHref} aria-label={`Remove filter ${c.label}`}
                  className="inline-flex h-7 items-center gap-1 rounded-full border bg-accent/50 pl-3 pr-2 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50">
                  {c.label} <X className="size-3" aria-hidden="true" />
                </Link>
              </li>
            ))}
            <li>
              <Link href={buildBrowseHref(basePath, {}, {}, fixed)} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                Clear all
              </Link>
            </li>
          </ul>
        ) : null}
      </div>
    </div>
  );
}
