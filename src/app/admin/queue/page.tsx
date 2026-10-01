import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/auth/viewer";
import { AuthorLine } from "@/components/admin/author-line";
import { firstParam, flagLabel, formatAge, formatDateTime, pageParam } from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { QueueActions } from "@/components/admin/queue-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { cn } from "@/lib/utils";
import { getModerationQueue } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Queue" };

export default async function AdminQueuePage({ searchParams }: PageProps<"/admin/queue">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const kind = firstParam(sp.tab) === "comments" ? "comment" : "prompt";
  const page = pageParam(sp.page);
  const result = await getModerationQueue(admin, { kind, page });

  const tabs = [
    { key: "prompt", label: "Prompts", href: "/admin/queue" },
    { key: "comment", label: "Comments", href: "/admin/queue?tab=comments" },
  ] as const;

  return (
    <>
      <PageHeader title="Review queue" description="Oldest first. Approve, reject or take down." />
      <nav aria-label="Queue type" className="mb-4 inline-flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={kind === t.key ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              kind === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <EmptyState title={`No ${kind}s waiting`} description="You are all caught up." />
      ) : (
        <ul className="grid gap-3" aria-label={`${kind === "prompt" ? "Prompts" : "Comments"} awaiting review`}>
          {result.items.map((item) => (
            <li key={item.id}>
              <Card size="sm">
                <CardContent className="grid gap-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div className="min-w-0">
                      <h2 className="text-base font-medium break-words">{item.title}</h2>
                      <p className="mt-0.5 line-clamp-3 text-sm whitespace-pre-line text-muted-foreground break-words">{item.excerpt}</p>
                    </div>
                    <Link
                      href={`/p/${item.promptSlug}`}
                      className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
                    >
                      View {item.kind === "prompt" ? "prompt" : "thread"} <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <AuthorLine author={item.author} />
                    <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)} className="text-xs text-muted-foreground">
                      {formatAge(item.createdAt)} ago
                    </time>
                    {item.openReportCount > 0 ? (
                      <Badge variant="destructive">{item.openReportCount} open report{item.openReportCount === 1 ? "" : "s"}</Badge>
                    ) : null}
                    {item.flags.map((f) => <Badge key={f} variant="secondary">{flagLabel(f)}</Badge>)}
                  </div>
                  <QueueActions
                    kind={item.kind}
                    id={item.id}
                    slug={item.promptSlug}
                    authorId={item.author.id}
                    authorUsername={item.author.username}
                    adminId={admin.id}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <PaginationLinks
        basePath="/admin/queue"
        searchParams={{ tab: kind === "comment" ? "comments" : undefined }}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </>
  );
}
