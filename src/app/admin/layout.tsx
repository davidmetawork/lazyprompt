import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { requireAdmin } from "@/auth/viewer";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminStats } from "@/server/moderation/queue";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | LazyPrompt" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  // Sidebar badges are decoration: never let a stats failure take the whole admin area down.
  const stats = await getAdminStats(admin).catch(() => null);
  const counts = {
    queue: stats ? stats.pendingPrompts + stats.pendingComments : null,
    reports: stats ? stats.openReports : null,
  };
  return (
    <div className="min-h-dvh bg-muted/20">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 md:flex-row md:gap-8 md:py-6">
        <aside className="md:sticky md:top-6 md:h-fit md:w-52 md:shrink-0">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Shield className="size-4 text-primary" aria-hidden />
            <span className="text-sm font-semibold">LazyPrompt admin</span>
          </div>
          <AdminNav counts={counts} />
          <Link
            href="/"
            className="mt-3 hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
          >
            <ArrowLeft className="size-4" aria-hidden /> Back to site
          </Link>
        </aside>
        <main className="min-w-0 flex-1">
          <Link href="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground md:hidden">
            <ArrowLeft className="size-4" aria-hidden /> Back to site
          </Link>
          {children}
        </main>
      </div>
    </div>
  );
}
