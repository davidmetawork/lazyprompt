import { listPromptsInputSchema, type ListPromptsInput } from "@/lib/validation";
import type { SortKey } from "@/lib/types";

export type SearchParams = Record<string, string | string[] | undefined>;

/** The URL-state keys of the browse pages. `use` is the public name of `useCase`. */
export interface BrowseState {
  q?: string;
  category?: string;
  tag?: string;
  model?: string;
  use?: string;
  sort?: SortKey;
  page: number;
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === "string" && s.trim() !== "" ? s.trim() : undefined;
}

/**
 * Validates raw URL params with the shared zod schema. Invalid fields are dropped individually
 * (a bad `model` must not break the page), never thrown.
 */
export function parseBrowseParams(sp: SearchParams): { state: BrowseState; input: ListPromptsInput } {
  const raw: Record<string, unknown> = {
    q: first(sp.q),
    category: first(sp.category),
    tag: first(sp.tag),
    model: first(sp.model),
    useCase: first(sp.use),
    sort: first(sp.sort),
    page: first(sp.page),
  };
  for (const k of Object.keys(raw)) if (raw[k] === undefined) delete raw[k];

  let parsed = listPromptsInputSchema.safeParse(raw);
  for (let i = 0; i < 8 && !parsed.success; i++) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") delete raw[key];
    }
    parsed = listPromptsInputSchema.safeParse(raw);
  }
  const d = parsed.success ? parsed.data : listPromptsInputSchema.parse({});
  const state: BrowseState = {
    q: d.q, category: d.category, tag: d.tag, model: d.model, use: d.useCase, sort: d.sort, page: d.page,
  };
  const input: ListPromptsInput = {
    q: d.q, category: d.category, tag: d.tag, model: d.model, useCase: d.useCase, sort: d.sort, page: d.page,
  };
  return { state, input };
}

/** The sort in effect: relevance when searching, otherwise top. */
export function effectiveSort(state: Pick<BrowseState, "q" | "sort">): SortKey {
  return state.sort ?? (state.q ? "relevance" : "top");
}

/** Builds a browse URL from a state plus overrides (undefined/null removes a key). Defaults are left out. */
export function buildBrowseHref(
  basePath: string,
  state: Partial<BrowseState>,
  patch: Partial<Record<keyof BrowseState, string | number | null | undefined>> = {},
  fixed: readonly (keyof BrowseState)[] = [],
): string {
  const merged: Record<string, string | number | null | undefined> = { ...state, ...patch };
  const qs = new URLSearchParams();
  for (const key of ["q", "category", "tag", "model", "use", "sort", "page"] as const) {
    if (fixed.includes(key)) continue;
    const v = merged[key];
    if (v === undefined || v === null || v === "") continue;
    if (key === "page" && Number(v) <= 1) continue;
    qs.set(key, String(v));
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Filters that make a listing a thin duplicate of other pages (everything except a bare `q`). */
export function hasIndexBlockingFilters(state: BrowseState): boolean {
  return Boolean(state.category || state.tag || state.model || state.use || state.sort);
}
