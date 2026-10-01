// PLACEHOLDER owned by community-ui.
import Link from "next/link";
import type { PromptStatus } from "@/lib/types";

export interface AuthorActionsProps { promptId: string; shortId: string; slug: string; status: PromptStatus }

export function AuthorActions({ slug, status }: AuthorActionsProps) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-muted-foreground">Status: {status}</span>
      <Link href={`/p/${slug}/edit`} className="text-primary underline-offset-4 hover:underline">Edit</Link>
    </div>
  );
}
