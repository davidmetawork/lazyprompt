import type { Metadata } from "next";
import { requireViewer } from "@/auth/viewer";
import { PromptForm } from "@/components/community/prompt-form";
import type { PromptFormValues } from "@/components/community/helpers";
import { Container } from "@/components/layout/container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PromptDetail } from "@/lib/types";
import { getPromptByShortId } from "@/server/prompts/queries";
import { listCategories } from "@/server/taxonomy";

export const metadata: Metadata = { title: "Submit a prompt", robots: { index: false, follow: false } };

function forkTitle(title: string): string {
  const t = `Fork of ${title}`;
  return t.length <= 100 ? t : `${t.slice(0, 99).trimEnd()}…`;
}

function forkValues(p: PromptDetail): Partial<PromptFormValues> {
  return {
    title: forkTitle(p.title), description: p.description, body: p.body, variables: p.variables,
    categorySlug: p.category.slug, useCase: p.useCase, tags: p.tags, models: p.models,
    exampleOutput: p.exampleOutput ?? "", notes: p.notes ?? "", license: "cc_by_4", forkedFromShortId: p.shortId,
  };
}

export default async function SubmitPage(props: PageProps<"/submit">) {
  const sp = await props.searchParams;
  const forkRaw = typeof sp.fork === "string" ? sp.fork.slice(0, 12) : undefined;
  const viewer = await requireViewer(forkRaw ? `/submit?fork=${encodeURIComponent(forkRaw)}` : "/submit");
  const [categories, source] = await Promise.all([
    listCategories(),
    forkRaw ? getPromptByShortId(forkRaw) : Promise.resolve(null),
  ]);

  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">{source ? "Fork a prompt" : "Submit a prompt"}</h1>
      <p className="mt-2 text-muted-foreground">
        {source
          ? `Improve "${source.title}" and share your version. The original author is credited automatically.`
          : "Share a prompt other people can fill in, copy and rate. It is free, and always will be."}
      </p>
      {forkRaw && !source ? (
        <Alert className="mt-6"><AlertDescription>We could not find that prompt to fork, so you are starting from a blank form.</AlertDescription></Alert>
      ) : null}
      <div className="mt-8">
        <PromptForm
          key={source?.id ?? "new"}
          mode="create"
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          initial={source ? forkValues(source) : undefined}
          reviewNotice={viewer.trustLevel === 0}
        />
      </div>
    </Container>
  );
}
