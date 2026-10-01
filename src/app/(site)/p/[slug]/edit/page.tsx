import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireViewer } from "@/auth/viewer";
import { PromptForm } from "@/components/community/prompt-form";
import { Container } from "@/components/layout/container";
import { parseShortIdFromSlug } from "@/lib/slug";
import { getPromptByShortId } from "@/server/prompts/queries";
import { listCategories } from "@/server/taxonomy";

export const metadata: Metadata = { title: "Edit prompt", robots: { index: false, follow: false } };

export default async function EditPromptPage(props: PageProps<"/p/[slug]/edit">) {
  const { slug } = await props.params;
  const viewer = await requireViewer(`/p/${slug}/edit`);
  const shortId = parseShortIdFromSlug(slug);
  if (!shortId) notFound();
  const prompt = await getPromptByShortId(shortId, { includeNonPublic: true });
  // Authorization is enforced again by updatePrompt/deletePrompt; this keeps the form away from everyone else.
  if (!prompt || prompt.status === "removed") notFound();
  if (prompt.author.id !== viewer.id && viewer.role !== "admin") notFound();
  const categories = await listCategories();

  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Edit prompt</h1>
      <p className="mt-2 text-muted-foreground">
        You are editing version {prompt.version}. Saving a change to the title, description, text or variables creates version {prompt.version + 1}.
      </p>
      <div className="mt-8">
        <PromptForm
          mode="edit"
          promptId={prompt.id}
          slug={prompt.slug}
          categories={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          initial={{
            title: prompt.title, description: prompt.description, body: prompt.body, variables: prompt.variables,
            categorySlug: prompt.category.slug, useCase: prompt.useCase, tags: prompt.tags, models: prompt.models,
            exampleOutput: prompt.exampleOutput ?? "", notes: prompt.notes ?? "", license: prompt.license,
          }}
        />
      </div>
    </Container>
  );
}
