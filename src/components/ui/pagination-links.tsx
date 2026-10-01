import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

function hrefFor(basePath: string, searchParams: SearchParams, page: number): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (k === "page" || v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) qs.append(k, item);
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Link-based pager (SEO friendly). Preserves every other search param. */
export function PaginationLinks({
  basePath, searchParams, page, pageSize, total, className,
}: { basePath: string; searchParams: SearchParams; page: number; pageSize: number; total: number; className?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const linkCls = "inline-flex h-8 items-center gap-1 rounded-lg border px-3 text-sm hover:bg-muted";
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3 pt-6", className)}>
      {page > 1 ? (
        <Link href={hrefFor(basePath, searchParams, page - 1)} rel="prev" className={linkCls}>
          <ChevronLeft className="size-4" /> Previous
        </Link>
      ) : <span />}
      <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
      {page < pages ? (
        <Link href={hrefFor(basePath, searchParams, page + 1)} rel="next" className={linkCls}>
          Next <ChevronRight className="size-4" />
        </Link>
      ) : <span />}
    </nav>
  );
}
