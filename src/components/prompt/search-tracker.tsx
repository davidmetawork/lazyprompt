"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** Fires the `search` analytics event once per result set. Carries the result count only, never the query. */
export function SearchTracker({ results, hasFilters }: { results: number; hasFilters: boolean }) {
  useEffect(() => {
    trackEvent("search", { results, hasFilters });
  }, [results, hasFilters]);
  return null;
}
