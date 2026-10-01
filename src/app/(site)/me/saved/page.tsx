import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/viewer";
import { Container } from "@/components/layout/container";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { MAX_PAGE } from "@/lib/constants";
import { listSavedPrompts } from "@/server/saves";

export const metadata: Metadata = { title: "Saved prompts", robots: { index: false, follow: false } };

export default async function SavedPromptsPage(props: PageProps<"/me/saved">) {
  const sp = await props.searchParams;
  const viewer = await requireViewer("/me/saved");
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const result = await listSavedPrompts(viewer.id, page);

  return (
    <Container className="py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Saved prompts</h1>
      <p className="mt-1 text-muted-foreground">Prompts you bookmarked. Only you can see this list.</p>
      <div className="mt-8">
        {result.items.length === 0 ? (
          <EmptyState title="Nothing saved yet" description="Tap Save on any prompt to keep it here."
            action={<Link href="/prompts" className={buttonVariants()}>Browse prompts</Link>} />
        ) : (
          <>
            <PromptGrid prompts={result.items} />
            <PaginationLinks basePath="/me/saved" searchParams={{}} page={result.page} pageSize={result.pageSize} total={result.total} />
          </>
        )}
      </div>
    </Container>
  );
}
