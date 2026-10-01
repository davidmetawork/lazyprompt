// PLACEHOLDER home: browse-ui replaces this with the real landing page.
import { Container } from "@/components/layout/container";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { getHomeSections } from "@/server/prompts/queries";

export default async function HomePage() {
  const { featured, top, latest } = await getHomeSections();
  const sections = [
    { title: "Featured", items: featured },
    { title: "Top rated", items: top },
    { title: "New", items: latest },
  ].filter((s) => s.items.length > 0);
  return (
    <Container className="py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Free AI prompts you can fill in and copy</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">Community-rated prompts for ChatGPT, Claude and more. No account needed.</p>
      {sections.length === 0 ? (
        <EmptyState className="mt-10" title="No prompts yet" description="Run pnpm db:seed to load the starter library." />
      ) : (
        sections.map((s) => (
          <section key={s.title} className="mt-12">
            <h2 className="mb-4 text-xl font-semibold tracking-tight">{s.title}</h2>
            <PromptGrid prompts={s.items} />
          </section>
        ))
      )}
    </Container>
  );
}
