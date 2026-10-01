import { Suspense } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { GitFork, History } from "lucide-react";
import { getViewer } from "@/auth/viewer";
import { Container } from "@/components/layout/container";
import { AuthorActions } from "@/components/community/author-actions";
import { CommentsSection } from "@/components/community/comments-section";
import { ForkButton } from "@/components/community/fork-button";
import { RatingWidget } from "@/components/community/rating-widget";
import { ReportButton } from "@/components/community/report-button";
import { SaveButton } from "@/components/community/save-button";
import { Breadcrumbs } from "@/components/prompt/breadcrumbs";
import { LICENSE_INFO, modelName, promptPageTitle, labelForUseCase } from "@/components/prompt/labels";
import { ModelBadges } from "@/components/prompt/model-badges";
import { RelatedPrompts } from "@/components/prompt/related-prompts";
import { StatusBanner } from "@/components/prompt/status-banner";
import { UsePanel } from "@/components/prompt/use-panel";
import { JsonLd } from "@/components/seo/json-ld";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Linkify } from "@/components/ui/linkify";
import { Skeleton } from "@/components/ui/skeleton";
import { promptJsonLd } from "@/lib/seo/jsonld";
import { buildMetadata } from "@/lib/seo/metadata";
import { parseShortIdFromSlug } from "@/lib/slug";
import type { PromptDetail, Viewer } from "@/lib/types";
import { getPromptByShortId, getViewerPromptState } from "@/server/prompts/queries";
import { wilsonLowerBound } from "@/server/ranking/score";

/** Same call in generateMetadata and the page: the primitive-keyed React cache dedupes the query. */
async function loadPrompt(slug: string): Promise<PromptDetail | null> {
  const shortId = parseShortIdFromSlug(slug);
  if (!shortId) return null;
  return getPromptByShortId(shortId, { includeNonPublic: true });
}

/** Public once published; otherwise only the author (not when removed) and admins. */
function canView(prompt: PromptDetail, viewer: Viewer | null): boolean {
  if (prompt.status === "published") return true;
  if (!viewer) return false;
  if (viewer.role === "admin") return true;
  return viewer.id === prompt.author.id && prompt.status !== "removed";
}

export async function generateMetadata({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [prompt, viewer] = await Promise.all([loadPrompt(slug), getViewer()]);
  if (!prompt || !canView(prompt, viewer)) notFound();
  return buildMetadata({
    title: promptPageTitle(prompt.title),
    description: prompt.description,
    path: `/p/${prompt.slug}`,
    noindex: prompt.status !== "published",
    type: "article",
  });
}

export default async function PromptPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const [prompt, viewer] = await Promise.all([loadPrompt(slug), getViewer()]);
  if (!prompt || !canView(prompt, viewer)) notFound();
  if (slug !== prompt.slug) permanentRedirect(`/p/${prompt.slug}`);

  const state = await getViewerPromptState(prompt.id, viewer);
  const published = prompt.status === "published";
  const feedbackTotal = prompt.workedCount + prompt.notWorkedCount;
  const workedPct = feedbackTotal >= 5 ? Math.round(wilsonLowerBound(prompt.workedCount, feedbackTotal) * 100) : null;
  const license = LICENSE_INFO[prompt.license];
  const signedIn = Boolean(viewer);

  return (
    <Container className="py-6 sm:py-8">
      {published ? <JsonLd data={promptJsonLd(prompt)} /> : null}
      <Breadcrumbs items={[
        { label: "Home", href: "/" },
        { label: prompt.category.name, href: `/c/${prompt.category.slug}` },
        { label: prompt.title },
      ]} />

      {!published ? (
        <div className="mt-4">
          <StatusBanner status={prompt.status} note={state.isAuthor ? prompt.moderationNote : null} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <header className="grid gap-4 lg:col-span-2">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{prompt.title}</h1>
          <p className="max-w-3xl text-lg text-muted-foreground">{prompt.description}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link href={`/u/${prompt.author.username}`} className="inline-flex items-center gap-2 rounded-full outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
              <Avatar size="sm">
                {prompt.author.image ? <AvatarImage src={prompt.author.image} alt="" /> : null}
                <AvatarFallback>{(prompt.author.name || prompt.author.username).slice(0, 1).toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{prompt.author.name || prompt.author.username}</span>
              <span className="sr-only">(@{prompt.author.username})</span>
            </Link>
            <Link href={`/c/${prompt.category.slug}`}><Badge variant="outline">{prompt.category.name}</Badge></Link>
            <Badge variant="outline">{labelForUseCase(prompt.useCase)}</Badge>
            <span className="inline-flex flex-wrap items-center gap-1.5" aria-label="Works with">
              <ModelBadges models={prompt.models} />
            </span>
          </div>

          {prompt.tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
              {prompt.tags.map((t) => (
                <li key={t}>
                  <Link href={`/t/${t}`} className="inline-flex h-6 items-center rounded-full bg-secondary px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50">
                    #{t}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {prompt.testedOn.length > 0 ? (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <span>Tested on</span>
              {prompt.testedOn.map((t) => (
                <Badge key={t.model} variant="secondary">
                  {modelName(t.model)}{t.version ? ` ${t.version}` : ""}{t.date ? ` (${t.date})` : ""}
                </Badge>
              ))}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <RatingWidget
              promptId={prompt.id} slug={prompt.slug} ratingAvg={prompt.ratingAvg} ratingCount={prompt.ratingCount}
              viewerRating={state.rating} signedIn={signedIn} isAuthor={state.isAuthor}
            />
            {workedPct !== null ? (
              <span className="text-sm" title={`Based on ${feedbackTotal} reports from people who tried it`}>
                <span className="font-medium">Worked for {workedPct}%</span>
                <span className="text-muted-foreground"> of {feedbackTotal} people</span>
              </span>
            ) : null}
            <SaveButton promptId={prompt.id} slug={prompt.slug} saved={state.saved} saveCount={prompt.saveCount} signedIn={signedIn} />
            <ForkButton shortId={prompt.shortId} signedIn={signedIn} />
            <ReportButton targetType="prompt" targetId={prompt.id} signedIn={signedIn} />
            {state.canEdit ? (
              <AuthorActions promptId={prompt.id} shortId={prompt.shortId} slug={prompt.slug} status={prompt.status} />
            ) : null}
          </div>

          {prompt.forkedFrom ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <GitFork className="size-3.5" aria-hidden="true" />
              Forked from{" "}
              <Link href={`/p/${prompt.forkedFrom.slug}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {prompt.forkedFrom.title}
              </Link>{" "}
              by {prompt.forkedFrom.author.name || prompt.forkedFrom.author.username}
              {prompt.forkedFrom.version ? ` (v${prompt.forkedFrom.version})` : ""}
            </p>
          ) : null}
        </header>

        {/* DOM order keeps the use panel above the example and comments on mobile; it is the sticky right column on desktop. */}
        <aside className="lg:sticky lg:top-20 lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
          <UsePanel
            prompt={{ id: prompt.id, shortId: prompt.shortId, title: prompt.title, body: prompt.body, variables: prompt.variables, models: prompt.models }}
            category={prompt.category.slug}
          />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Prompt template
            </summary>
            <pre data-testid="prompt-body" className="overflow-x-auto whitespace-pre-wrap break-words border-t px-4 py-3 font-mono text-sm leading-relaxed">{prompt.body}</pre>
          </details>

          {prompt.exampleOutput ? (
            <details className="mt-4 rounded-xl border bg-card">
              <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Example output
              </summary>
              <div data-testid="example-output" className="whitespace-pre-wrap break-words border-t px-4 py-3 text-sm leading-relaxed">{prompt.exampleOutput}</div>
            </details>
          ) : null}

          {prompt.notes ? (
            <section aria-labelledby="notes-heading" className="mt-8">
              <h2 id="notes-heading" className="mb-2 text-lg font-semibold tracking-tight">Why it works</h2>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
                <Linkify text={prompt.notes} />
              </p>
            </section>
          ) : null}

          <p className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Licensed{" "}
              <a href={license.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
                {license.label}
              </a>
            </span>
            <Link href={`/p/${prompt.slug}/versions`} className="inline-flex items-center gap-1 underline-offset-4 hover:text-foreground hover:underline">
              <History className="size-3.5" aria-hidden="true" /> Version {prompt.version} · history
            </Link>
          </p>

          {published ? (
            <div className="mt-10">
              <Suspense fallback={<Skeleton className="h-40 w-full" />}>
                <CommentsSection promptId={prompt.id} slug={prompt.slug} commentCount={prompt.commentCount} />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>

      {published ? (
        <Suspense fallback={null}>
          <RelatedPrompts promptId={prompt.id} />
        </Suspense>
      ) : null}
    </Container>
  );
}
