import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/auth/viewer";
import { AuthorLine } from "@/components/admin/author-line";
import { formatAge } from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { USAGE_EVENT_TYPES } from "@/lib/constants";
import { getAdminStats, getModerationQueue } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Dashboard" };

const nf = new Intl.NumberFormat("en-US");

function Stat({ label, value, href, alert }: { label: string; value: number; href?: string; alert?: boolean }) {
  const body = (
    <Card size="sm" className={href ? "transition-colors hover:bg-muted/50" : undefined}>
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${alert && value > 0 ? "text-primary" : ""}`}>{nf.format(value)}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{body}</Link> : body;
}

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();
  const [stats, prompts, comments] = await Promise.all([
    getAdminStats(admin),
    getModerationQueue(admin, { kind: "prompt", page: 1 }),
    getModerationQueue(admin, { kind: "comment", page: 1 }),
  ]);
  const oldest = [...prompts.items, ...comments.items]
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Dashboard" description="What needs attention right now." />
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pending prompts" value={stats.pendingPrompts} href="/admin/queue" alert />
        <Stat label="Pending comments" value={stats.pendingComments} href="/admin/queue?tab=comments" alert />
        <Stat label="Open reports" value={stats.openReports} href="/admin/reports" alert />
        <Stat label="Hidden prompts" value={stats.hiddenPrompts} href="/admin/prompts?status=hidden" />
        <Stat label="Published prompts" value={stats.promptsPublished} href="/admin/prompts?status=published" />
        <Stat label="Users" value={stats.usersTotal} href="/admin/users" />
        <Stat label="New users (7 days)" value={stats.usersLast7d} />
      </section>

      <section aria-labelledby="events-heading" className="mt-6">
        <h2 id="events-heading" className="mb-2 text-sm font-semibold">Activity in the last 7 days</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {USAGE_EVENT_TYPES.map((t) => (
            <Stat key={t} label={t.replace("_", " ")} value={stats.events7d[t] ?? 0} />
          ))}
        </div>
      </section>

      <section aria-labelledby="oldest-heading" className="mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle id="oldest-heading">Oldest in the queue</CardTitle>
            <Link href="/admin/queue" className={buttonVariants({ variant: "outline", size: "sm" })}>Open queue</Link>
          </CardHeader>
          <CardContent>
            {oldest.length === 0 ? (
              <EmptyState title="Queue is empty" description="Nothing is waiting for review." />
            ) : (
              <ul className="divide-y">
                {oldest.map((item) => (
                  <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Badge variant="outline">{item.kind}</Badge>
                    <Link href={`/p/${item.promptSlug}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{item.title}</Link>
                    <AuthorLine author={item.author} />
                    {item.flags.length ? <Badge variant="secondary">{item.flags.length} flag{item.flags.length === 1 ? "" : "s"}</Badge> : null}
                    <span className="text-xs text-muted-foreground">{formatAge(item.createdAt)} ago</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
