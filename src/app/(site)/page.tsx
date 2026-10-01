import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Container } from "@/components/layout/container";
import { CategoryIcon } from "@/components/prompt/category-icon";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import { scheduleRankingRecompute } from "@/components/prompt/safe";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { websiteJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getHomeSections } from "@/server/prompts/queries";
import { listCategories } from "@/server/taxonomy";

const homeTitle = `${SITE_NAME} - free AI prompts`;
export const metadata = {
  ...buildMetadata({ title: homeTitle, description: SITE_TAGLINE, path: "/" }),
  title: { absolute: homeTitle },   // the root title template would otherwise repeat the site name
};

export default async function HomePage() {
  scheduleRankingRecompute();
  const [sections, categories] = await Promise.all([getHomeSections(), listCategories()]);

  const blocks = [
    { id: "featured", title: "Featured", items: sections.featured, href: "/prompts?sort=top" },
    { id: "trending", title: "Trending", items: sections.trending, href: "/prompts?sort=trending" },
    { id: "top", title: "Top rated", items: sections.top, href: "/prompts?sort=top" },
    { id: "new", title: "New", items: sections.latest, href: "/prompts?sort=new" },
  ].filter((b) => b.items.length > 0);

  return (
    <>
      <JsonLd data={websiteJsonLd()} />
      <section className="border-b bg-gradient-to-b from-accent/60 to-background">
        <Container className="py-14 sm:py-20">
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            The best AI prompts, ready to use
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Free, community-rated prompts for ChatGPT, Claude and more. Fill in the blanks, copy, done. No account needed.
          </p>
          <form action="/prompts" method="get" role="search" className="mt-8 flex max-w-2xl gap-2">
            <label htmlFor="hero-search" className="sr-only">Search prompts</label>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="hero-search" name="q" type="search" maxLength={200} placeholder="Search prompts, e.g. email, SQL, resume"
                className="h-12 w-full rounded-xl border bg-background pl-11 pr-3 text-base shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
            <button type="submit" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-5 text-base")}>Search</button>
          </form>
          {categories.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="Popular categories">
              {categories.slice(0, 8).map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-background px-3 text-sm font-medium outline-none transition hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50">
                    <CategoryIcon name={c.icon} className="size-3.5 text-primary" />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        {blocks.length === 0 ? (
          <EmptyState title="No prompts yet" description="Run pnpm db:seed to load the starter library." />
        ) : (
          blocks.map((b) => (
            <section key={b.id} aria-labelledby={`home-${b.id}`} className="mb-12 last:mb-0">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 id={`home-${b.id}`} className="text-xl font-semibold tracking-tight">{b.title}</h2>
                <Link href={b.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  See all <span className="sr-only">{b.title} prompts</span> <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </div>
              <PromptGrid prompts={b.items.slice(0, 6)} />
            </section>
          ))
        )}

        {categories.length > 0 ? (
          <section aria-labelledby="home-categories" className="mt-14">
            <h2 id="home-categories" className="mb-4 text-xl font-semibold tracking-tight">Browse by category</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`/c/${c.slug}`}
                    className="group flex items-center gap-3 rounded-xl border bg-card p-4 outline-none transition hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                      <CategoryIcon name={c.icon} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {c.promptCount} {c.promptCount === 1 ? "prompt" : "prompts"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>
    </>
  );
}
