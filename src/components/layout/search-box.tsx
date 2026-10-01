import { Search } from "lucide-react";

/** Plain GET form to /prompts?q= (works without JS). */
export function SearchBox({ defaultValue, className }: { defaultValue?: string; className?: string }) {
  return (
    <form action="/prompts" method="get" role="search" className={className}>
      <label htmlFor="site-search" className="sr-only">Search prompts</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="site-search" name="q" type="search" defaultValue={defaultValue} maxLength={200}
          placeholder="Search prompts"
          className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
    </form>
  );
}
