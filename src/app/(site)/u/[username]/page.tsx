import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, Link as LinkIcon } from "lucide-react";
import { getViewer } from "@/auth/viewer";
import { ReportButton } from "@/components/community/report-button";
import { Container } from "@/components/layout/container";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Linkify } from "@/components/ui/linkify";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { MAX_PAGE } from "@/lib/constants";
import { buildMetadata } from "@/lib/seo/metadata";
import { listPromptsByAuthor } from "@/server/prompts/queries";
import { getProfileByUsername } from "@/server/users";

const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/;
const joinedFmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });

async function load(raw: string) {
  const username = raw.toLowerCase();
  if (!USERNAME_RE.test(username)) return null;
  return getProfileByUsername(username);
}

export async function generateMetadata(props: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await props.params;
  const profile = await load(username);
  if (!profile) return { title: "Not found" };
  return buildMetadata({
    title: `${profile.name} (@${profile.username})`,
    description: profile.bio || `Prompts shared by ${profile.name} on LazyPrompt.`,
    path: `/u/${profile.username}`,
    noindex: profile.publishedPromptCount === 0,
  });
}

export default async function ProfilePage(props: PageProps<"/u/[username]">) {
  const [{ username }, sp] = await Promise.all([props.params, props.searchParams]);
  const profile = await load(username);
  if (!profile) notFound();
  const viewer = await getViewer();
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const prompts = await listPromptsByAuthor(profile.userId, { page });
  const isSelf = viewer?.id === profile.userId;
  const initials = (profile.name || profile.username).slice(0, 2).toUpperCase();

  return (
    <Container className="py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Avatar className="size-20">
          {profile.image ? <AvatarImage src={profile.image} alt="" /> : null}
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">{profile.name}</h1>
            {profile.isSystem ? <Badge variant="secondary"><BadgeCheck /> Official LazyPrompt account</Badge> : null}
          </div>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.bio ? <Linkify text={profile.bio} className="block max-w-2xl whitespace-pre-wrap break-words" /> : null}
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> Joined <time dateTime={profile.joinedAt}>{joinedFmt.format(new Date(profile.joinedAt))}</time>
            </li>
            <li>{profile.publishedPromptCount} published {profile.publishedPromptCount === 1 ? "prompt" : "prompts"}</li>
            {profile.website && /^https:\/\//i.test(profile.website) ? (
              <li className="inline-flex min-w-0 items-center gap-1.5">
                <LinkIcon className="size-4 shrink-0" />
                <a href={profile.website} target="_blank" rel="ugc nofollow noopener noreferrer"
                  className="truncate text-primary underline-offset-4 hover:underline">
                  {profile.website.replace(/^https:\/\//i, "")}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        {!isSelf ? <ReportButton targetType="user" targetId={profile.userId} signedIn={viewer !== null} /> : null}
      </header>

      <section aria-labelledby="profile-prompts" className="mt-10">
        <h2 id="profile-prompts" className="mb-4 text-xl font-semibold tracking-tight">Prompts</h2>
        {prompts.items.length === 0 ? (
          <EmptyState title="No published prompts yet" description={isSelf ? "Submit a prompt to see it here." : undefined} />
        ) : (
          <>
            <PromptGrid prompts={prompts.items} />
            <PaginationLinks basePath={`/u/${profile.username}`} searchParams={{}} page={prompts.page}
              pageSize={prompts.pageSize} total={prompts.total} />
          </>
        )}
      </section>
    </Container>
  );
}
