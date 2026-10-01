import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/auth/viewer";
import { firstParam, flagLabel, formatAge, pageParam } from "@/components/admin/helpers";
import { PageHeader } from "@/components/admin/page-header";
import { PromptRowActions } from "@/components/admin/prompt-row-actions";
import { AdminSearchForm } from "@/components/admin/search-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PROMPT_STATUSES } from "@/lib/constants";
import { listAdminPrompts } from "@/server/moderation/queue";

export const metadata: Metadata = { title: "Prompts" };

export default async function AdminPromptsPage({ searchParams }: PageProps<"/admin/prompts">) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const rawStatus = firstParam(sp.status);
  const status = PROMPT_STATUSES.find((s) => s === rawStatus);
  const page = pageParam(sp.page);
  const result = await listAdminPrompts(admin, { q, status, page });

  return (
    <>
      <PageHeader title="Prompts" description="Every prompt in every status." />
      <div className="mb-4">
        <AdminSearchForm action="/admin/prompts" q={q} placeholder="Search title, description, slug">
          <div className="grid gap-1">
            <label htmlFor="admin-status" className="sr-only">Status</label>
            <select
              id="admin-status"
              name="status"
              defaultValue={status ?? ""}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="">All statuses</option>
              {PROMPT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </AdminSearchForm>
      </div>

      {result.items.length === 0 ? (
        <EmptyState title="No prompts match" description="Try a different search or status." />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">Author</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="hidden lg:table-cell">Updated</TableHead>
                <TableHead scope="col">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="max-w-xs whitespace-normal">
                    <Link href={`/p/${p.slug}`} className="font-medium hover:underline">{p.title}</Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {p.isFeatured ? <Badge>Featured</Badge> : null}
                      {p.moderationFlags.map((f) => <Badge key={f} variant="secondary">{flagLabel(f)}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell>@{p.author.username}</TableCell>
                  <TableCell><Badge variant={p.status === "published" ? "outline" : "secondary"}>{p.status}</Badge></TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    <time dateTime={p.updatedAt}>{formatAge(p.updatedAt)} ago</time>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <PromptRowActions id={p.id} slug={p.slug} title={p.title} status={p.status} isFeatured={p.isFeatured} version={p.version} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <PaginationLinks
        basePath="/admin/prompts"
        searchParams={{ q, status }}
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
      />
    </>
  );
}
