import Link from "next/link";
import { getViewer } from "@/auth/viewer";
import { COMMENT_LIST_LIMIT, listCommentsPage } from "@/server/comments";
import { CommentForm } from "./comment-form";
import { CommentItem } from "./comment-item";
import { signInHref, toCommentView } from "./helpers";

export interface CommentsSectionProps { promptId: string; slug: string; commentCount: number }

/** Async server component: loads the thread for the current viewer (visible comments plus their own pending ones). */
export async function CommentsSection({ promptId, slug, commentCount }: CommentsSectionProps) {
  const viewer = await getViewer();
  const { comments: nodes, truncated } = await listCommentsPage(promptId, viewer);
  const comments = nodes.map((n) => toCommentView(n));
  const signedIn = viewer !== null;
  const count = Math.max(commentCount, comments.length);

  return (
    <section id="comments" aria-labelledby="comments-heading" className="space-y-6 scroll-mt-20">
      <h2 id="comments-heading" className="text-xl font-semibold tracking-tight">
        Comments <span className="text-muted-foreground tabular-nums">({count})</span>
      </h2>

      {signedIn ? (
        <CommentForm promptId={promptId} slug={slug} />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Link href={signInHref(`/p/${slug}#comments`)} className="text-primary underline-offset-4 hover:underline">Sign in</Link>
          {" "}to join the discussion.
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet. Be the first to share how it worked.</p>
      ) : (
        <ul className="space-y-6">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} promptId={promptId} slug={slug} signedIn={signedIn} depth={0} />
          ))}
        </ul>
      )}
      {truncated ? (
        <p role="note" className="text-sm text-muted-foreground">Showing the first {COMMENT_LIST_LIMIT} comments.</p>
      ) : null}
    </section>
  );
}
