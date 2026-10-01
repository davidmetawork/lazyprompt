import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo/metadata";
import { parseShortIdFromSlug } from "@/lib/slug";
import { getPromptByShortId, listPromptVersions } from "@/server/prompts/queries";

async function load(slug: string) {
  const shortId = parseShortIdFromSlug(slug);
  if (!shortId) return null;
  return getPromptByShortId(shortId); // published prompts only
}

export async function generateMetadata(props: PageProps<"/p/[slug]/versions">): Promise<Metadata> {
  const { slug } = await props.params;
  const p = await load(slug);
  if (!p) return { title: "Not found" };
  return buildMetadata({
    title: `Version history: ${p.title}`, description: `Every published version of ${p.title}.`,
    path: `/p/${p.slug}/versions`, noindex: true,
  });
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

export default async function VersionsPage(props: PageProps<"/p/[slug]/versions">) {
  const { slug } = await props.params;
  const prompt = await load(slug);
  if (!prompt) notFound();
  const versions = await listPromptVersions(prompt.id);

  return (
    <Container className="max-w-3xl py-10">
      <p className="text-sm"><Link href={`/p/${prompt.slug}`} className="text-primary underline-offset-4 hover:underline">&larr; Back to {prompt.title}</Link></p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Version history</h1>
      <p className="mt-2 text-muted-foreground">Every saved version of this prompt. The current version is {prompt.version}.</p>
      {versions.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No earlier versions yet.</p>
      ) : (
        <ol className="mt-8 divide-y rounded-xl border">
          {versions.map((v) => (
            <li key={v.version} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Link href={`/p/${prompt.slug}/versions/${v.version}`} className="hover:underline">Version {v.version}</Link>
                  {v.version === prompt.version ? <Badge variant="secondary">Current</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">{v.changeNote ?? (v.version === 1 ? "First version" : "No change note")}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                <time dateTime={v.createdAt}>{dateFmt.format(new Date(v.createdAt))}</time>
                {v.editor ? <> by <Link href={`/u/${v.editor.username}`} className="hover:underline">@{v.editor.username}</Link></> : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Container>
  );
}
