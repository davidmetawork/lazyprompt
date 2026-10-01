import type { Metadata } from "next";
import { requireAdmin } from "@/auth/viewer";
import { actionLabel, formatDateTime, pageParam } from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listModerationLog } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Log" };

export default async function AdminLogPage({ searchParams }: PageProps<"/admin/log">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const result = await listModerationLog(admin, pageParam(sp.page));

  return (
    <>
      <PageHeader title="Moderation log" description="Every moderation action, newest first." />
      {result.items.length === 0 ? (
        <EmptyState title="Nothing logged yet" />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">When</TableHead>
                <TableHead scope="col">Actor</TableHead>
                <TableHead scope="col">Action</TableHead>
                <TableHead scope="col">Target</TableHead>
                <TableHead scope="col">Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-muted-foreground">
                    <time dateTime={l.createdAt}>{formatDateTime(l.createdAt)}</time>
                  </TableCell>
                  <TableCell>{l.actor ? `@${l.actor.username}` : <span className="text-muted-foreground">system</span>}</TableCell>
                  <TableCell><Badge variant="secondary">{actionLabel(l.action)}</Badge></TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="capitalize">{l.targetType}</span>{" "}
                    <code className="text-xs text-muted-foreground" title={l.targetId}>{l.targetId.slice(0, 8)}</code>
                  </TableCell>
                  <TableCell className="max-w-sm whitespace-normal break-words">{l.reason ?? <span className="text-muted-foreground">-</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationLinks basePath="/admin/log" searchParams={{}} page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
