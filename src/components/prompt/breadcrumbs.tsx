import Link from "next/link";
import { ChevronRight } from "lucide-react";

/** Visual breadcrumb; the BreadcrumbList JSON-LD comes from promptJsonLd. */
export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" /> : null}
            {item.href ? (
              <Link href={item.href} className="rounded outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
