import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/auth/viewer";
import {
  formatAge, formatDateTime, groupReportsByTarget, pageParam, parseReportStatus, reportReasonLabel, slugFromHref,
  REPORT_STATUS_FILTERS, firstParam,
} from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { ReportActions } from "@/components/admin/report-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { cn } from "@/lib/utils";
import { listReports } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const status = parseReportStatus(firstParam(sp.status));
  const page = pageParam(sp.page);
  const result = await listReports(admin, { status, page });
  const groups = groupReportsByTarget(result.items);

  return (
    <>
      <PageHeader title="Reports" description="Grouped by reported content. Actioning one resolves every open report for it." />
      <nav aria-label="Report status" className="mb-4 inline-flex gap-1 rounded-lg bg-muted p-1">
        {REPORT_STATUS_FILTERS.map((s) => (
          <Link
            key={s}
            href={s === "open" ? "/admin/reports" : `/admin/reports?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium capitalize outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              status === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <EmptyState title={`No ${status} reports`} description={status === "open" ? "Nothing needs attention." : undefined} />
      ) : (
        <ul className="grid gap-4" aria-label={`${status} reports by target`}>
          {groups.map((g) => (
            <li key={g.key}>
              <Card size="sm">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline" className="capitalize">{g.targetType}</Badge>
                    <h2 className="min-w-0 truncate text-base font-medium">{g.target.label}</h2>
                    <Badge variant="secondary">{g.target.status}</Badge>
                    {g.sameTargetOpenCount > 0 ? (
                      <Badge variant="destructive">{g.sameTargetOpenCount} open</Badge>
                    ) : null}
                  </div>
                  <Link href={g.target.href} className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
                    View {g.targetType} <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ul className="divide-y rounded-lg border">
                    {g.reports.map((r) => (
                      <li key={r.id} className="grid gap-2 p-3">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Badge>{reportReasonLabel(r.reason)}</Badge>
                          <span className="text-sm">by <span className="font-medium">@{r.reporter.username}</span></span>
                          <time dateTime={r.createdAt} title={formatDateTime(r.createdAt)} className="text-xs text-muted-foreground">
                            {formatAge(r.createdAt)} ago
                          </time>
                          {r.status !== "open" ? <Badge variant="secondary" className="capitalize">{r.status}</Badge> : null}
                        </div>
                        {r.details ? <p className="text-sm whitespace-pre-line break-words text-muted-foreground">{r.details}</p> : null}
                        {r.status === "open" ? (
                          <ReportActions
                            reportId={r.id}
                            targetType={r.targetType}
                            targetId={r.targetId}
                            slug={slugFromHref(r.target.href)}
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <PaginationLinks
        basePath="/admin/reports"
        searchParams={{ status: status === "open" ? undefined : status }}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </>
  );
}
