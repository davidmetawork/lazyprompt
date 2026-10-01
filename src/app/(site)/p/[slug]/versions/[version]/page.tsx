import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/layout/container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buildMetadata } from "@/lib/seo/metadata";
import { parseShortIdFromSlug } from "@/lib/slug";
import { getPromptByShortId, getPromptVersion } from "@/server/prompts/queries";

async function load(slug: string, versionRaw: string) {
  const shortId = parseShortIdFromSlug(slug);
  if (!shortId || !/^\d{1,6}$/.test(versionRaw)) return null;
  const version = Number(versionRaw);
  if (version < 1) return null;
  const prompt = await getPromptByShortId(shortId);
  if (!prompt) return null;
  const old = await getPromptVersion(prompt.id, version);
  return old ? { prompt, old } : null;
}

export async function generateMetadata(props: PageProps<"/p/[slug]/versions/[version]">): Promise<Metadata> {
  const { slug, version } = await props.params;
  const data = await load(slug, version);
  if (!data) return { title: "Not found" };
  return buildMetadata({
    title: `${data.old.title} (v${data.old.version})`, description: data.old.description,
    path: `/p/${data.prompt.slug}/versions/${data.old.version}`, noindex: true,
  });
}

export default async function VersionPage(props: PageProps<"/p/[slug]/versions/[version]">) {
  const { slug, version } = await props.params;
  const data = await load(slug, version);
  if (!data) notFound();
  const { prompt, old } = data;

  return (
    <Container className="max-w-3xl py-10">
      <Alert role="status">
        <AlertDescription>
          You are viewing v{old.version} of {prompt.version}.{" "}
          <Link href={`/p/${prompt.slug}`} className="font-medium underline underline-offset-4">Go to the current version</Link>
          {" · "}
          <Link href={`/p/${prompt.slug}/versions`} className="underline underline-offset-4">All versions</Link>
        </AlertDescription>
      </Alert>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{old.title}</h1>
      <p className="mt-2 text-muted-foreground">{old.description}</p>
      {old.changeNote ? <p className="mt-3 text-sm"><span className="font-medium">Change note:</span> {old.changeNote}</p> : null}

      <h2 className="mt-8 text-lg font-semibold tracking-tight">Prompt</h2>
      <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 font-mono text-[13px] leading-relaxed">{old.body}</pre>

      {old.variables.length > 0 ? (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Variables</h2>
          <ul className="mt-2 space-y-2">
            {old.variables.map((v) => (
              <li key={v.key} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{`{{${v.key}}}`}</code>
                  <span className="font-medium">{v.label}</span>
                  <Badge variant="outline">{v.type}</Badge>
                  {v.required ? <Badge variant="secondary">required</Badge> : null}
                </div>
                {v.options?.length ? <p className="mt-1 text-muted-foreground">Options: {v.options.join(", ")}</p> : null}
                {v.default ? <p className="mt-1 text-muted-foreground">Default: {v.default}</p> : null}
                {v.help ? <p className="mt-1 text-muted-foreground">{v.help}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {old.exampleOutput ? (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Example output</h2>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4 text-sm">{old.exampleOutput}</pre>
        </>
      ) : null}
      {old.notes ? (
        <>
          <h2 className="mt-8 text-lg font-semibold tracking-tight">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{old.notes}</p>
        </>
      ) : null}
    </Container>
  );
}
