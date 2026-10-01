import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/viewer";
import { Container } from "@/components/layout/container";
import { PromptGrid } from "@/components/prompt/prompt-grid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { MAX_PAGE } from "@/lib/constants";
import { listPromptsByAuthor } from "@/server/prompts/queries";

export const metadata: Metadata = { title: "My prompts", robots: { index: false, follow: false } };

export default async function MyPromptsPage(props: PageProps<"/me/prompts">) {
  const sp = await props.searchParams;
  const viewer = await requireViewer("/me/prompts");
  const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(typeof sp.page === "string" ? sp.page : "1", 10) || 1));
  const result = await listPromptsByAuthor(viewer.id, { page, includeNonPublic: true });
  const submitted = sp.submitted === "1";

  return (
    <Container className="py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">My prompts</h1>
          <p className="mt-1 text-muted-foreground">Everything you have submitted, with its review status.</p>
        </div>
        <Link href="/submit" className={buttonVariants()}>Submit a prompt</Link>
      </div>
      {submitted ? (
        <Alert className="mt-6" role="status">
          <AlertDescription>Thanks! New members&apos; prompts are reviewed before publishing. You will see it here as soon as it is approved.</AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-8">
        {result.items.length === 0 ? (
          <EmptyState title="You have not submitted anything yet"
            description="Share a prompt you rely on and let the community rate it."
            action={<Link href="/submit" className={buttonVariants()}>Submit your first prompt</Link>} />
        ) : (
          <>
            <PromptGrid prompts={result.items} showStatus />
            <PaginationLinks basePath="/me/prompts" searchParams={{}} page={result.page} pageSize={result.pageSize} total={result.total} />
          </>
        )}
      </div>
    </Container>
  );
}
