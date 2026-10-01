// Working minimal card; browse-ui owns this file afterwards. The DTO is imported as PromptCardData to avoid the name clash.
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StarsDisplay } from "@/components/ui/stars-display";
import type { PromptCard as PromptCardData, PromptStatus } from "@/lib/types";

export function PromptCard({
  prompt, showStatus,
}: {
  prompt: PromptCardData & { status?: PromptStatus; moderationNote?: string | null };
  showStatus?: boolean;
}) {
  return (
    <article className="group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition hover:border-primary/40 hover:shadow-md">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{prompt.category.name}</Badge>
        {showStatus && prompt.status ? <Badge variant="outline">{prompt.status}</Badge> : null}
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight">
        <Link href={`/p/${prompt.slug}`} className="after:absolute after:inset-0">{prompt.title}</Link>
      </h3>
      <p className="line-clamp-3 text-sm text-muted-foreground">{prompt.description}</p>
      {showStatus && prompt.moderationNote ? (
        <p className="text-xs text-destructive">Moderator note: {prompt.moderationNote}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between pt-2">
        <StarsDisplay rating={prompt.ratingAvg} count={prompt.ratingCount} />
        <span className="text-xs text-muted-foreground tabular-nums">{prompt.copyCount} copies</span>
      </div>
    </article>
  );
}
