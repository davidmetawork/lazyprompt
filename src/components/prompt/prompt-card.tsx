// Owned by browse-ui. The DTO is imported as PromptCardData to avoid the name clash; props are frozen (section 22).
import Link from "next/link";
import { Copy, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StarsDisplay } from "@/components/ui/stars-display";
import { cn } from "@/lib/utils";
import type { PromptCard as PromptCardData, PromptStatus } from "@/lib/types";
import { STATUS_LABELS } from "./labels";
import { ModelIcons } from "./model-badges";

const STATUS_VARIANT: Record<PromptStatus, "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  pending: "secondary",
  published: "outline",
  rejected: "destructive",
  hidden: "destructive",
  removed: "destructive",
};

export function PromptCard({
  prompt, showStatus,
}: {
  prompt: PromptCardData & { status?: PromptStatus; moderationNote?: string | null };
  showStatus?: boolean;
}) {
  const status = showStatus ? prompt.status : undefined;
  return (
    <article
      data-testid="prompt-card"
      className={cn(
        "group relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition",
        "hover:border-primary/40 hover:shadow-md focus-within:border-primary/60 focus-within:ring-3 focus-within:ring-ring/40",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{prompt.category.name}</Badge>
        {status ? <Badge variant={STATUS_VARIANT[status]} data-testid="status-badge">{STATUS_LABELS[status]}</Badge> : null}
      </div>
      <h3 className="text-base font-semibold leading-snug tracking-tight">
        <Link href={`/p/${prompt.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
          {prompt.title}
        </Link>
      </h3>
      <p className="line-clamp-3 text-sm text-muted-foreground">{prompt.description}</p>
      {status === "rejected" && prompt.moderationNote ? (
        <p className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          Moderator note: {prompt.moderationNote}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
        <StarsDisplay rating={prompt.ratingAvg} count={prompt.ratingCount} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <ModelIcons models={prompt.models} />
          {prompt.variableCount > 0 ? (
            <span className="inline-flex items-center gap-1" title={`${prompt.variableCount} fill-in fields`}>
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              <span className="tabular-nums">{prompt.variableCount}</span>
              <span className="sr-only">fill-in fields</span>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 tabular-nums" title={`${prompt.copyCount} copies`}>
            <Copy className="size-3.5" aria-hidden="true" />
            {prompt.copyCount}
            <span className="sr-only">copies</span>
          </span>
        </div>
      </div>
    </article>
  );
}
