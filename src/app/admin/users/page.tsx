import type { Metadata } from "next";
import { requireAdmin } from "@/auth/viewer";
import { firstParam, formatAge, pageParam } from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { AdminSearchForm } from "@/components/admin/search-form";
import { TrustSelect, UserBanControl } from "@/components/admin/user-row-actions";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAdminUsers } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const page = pageParam(sp.page);
  const result = await listAdminUsers(admin, { q, page });

  return (
    <>
      <PageHeader title="Users" description="Search by email or username." />
      <div className="mb-4">
        <AdminSearchForm action="/admin/users" q={q} placeholder="Email or username" />
      </div>

      {result.items.length === 0 ? (
        <EmptyState title="No users match" description="Try a different search." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">User</TableHead>
                <TableHead scope="col">Role</TableHead>
                <TableHead scope="col">Trust level</TableHead>
                <TableHead scope="col" className="text-right">Prompts</TableHead>
                <TableHead scope="col" className="hidden lg:table-cell">Joined</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Ban</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">@{u.username}</div>
                    <div className="text-xs break-all text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell><Badge variant={u.role === "admin" ? "default" : "outline"}>{u.role}</Badge></TableCell>
                  <TableCell><TrustSelect userId={u.id} username={u.username} level={u.trustLevel} /></TableCell>
                  <TableCell className="text-right tabular-nums">{u.promptCount}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    <time dateTime={u.createdAt}>{formatAge(u.createdAt)} ago</time>
                  </TableCell>
                  <TableCell>{u.banned ? <Badge variant="destructive">Banned</Badge> : <Badge variant="outline">Active</Badge>}</TableCell>
                  <TableCell>
                    <UserBanControl userId={u.id} username={u.username} banned={u.banned} isSelf={u.id === admin.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationLinks basePath="/admin/users" searchParams={{ q }} page={result.page} pageSize={result.pageSize} total={result.total} />
    </>
  );
}
