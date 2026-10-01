"use client";
import { useId, useState, useTransition } from "react";
import { Reply, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteCommentAction, updateCommentAction } from "@/actions/comments";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Linkify } from "@/components/ui/linkify";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { CommentForm } from "./comment-form";
import { COMMENT_MAX, type CommentView } from "./helpers";
import { ReportButton } from "./report-button";
import { useActionFailure } from "./use-action-failure";

export interface CommentItemProps {
  comment: CommentView;
  promptId: string;
  slug: string;
  signedIn: boolean;
  /** 0 for top-level comments, 1 for replies. Replies can never be replied to. */
  depth: 0 | 1;
}

export function CommentItem({ comment, promptId, slug, signedIn, depth }: CommentItemProps) {
  const fail = useActionFailure();
  const editId = useId();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const { author } = comment;
  const hidden = comment.status === "hidden" || comment.status === "removed";

  function saveEdit() {
    const body = draft.trim();
    if (!body || body.length > COMMENT_MAX) return;
    setEditError(null);
    startTransition(async () => {
      const r = await updateCommentAction({ commentId: comment.id, slug, body });
      if (r.ok) {
        setEditing(false);
        toast.success("Comment updated");
      } else if (r.code === "VALIDATION" || r.code === "FORBIDDEN") {
        setEditError(r.message);
      } else {
        fail(r, "Could not update your comment");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await deleteCommentAction({ commentId: comment.id, slug });
      if (r.ok) {
        setDeleteOpen(false);
        toast.success("Comment deleted");
      } else {
        setDeleteOpen(false);
        fail(r, "Could not delete your comment");
      }
    });
  }

  return (
    <li id={`comment-${comment.id}`} className="space-y-3" data-testid="comment" data-depth={depth}>
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-8">
          {author.image ? <AvatarImage src={author.image} alt="" /> : null}
          <AvatarFallback>{(author.name || author.username).slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Link href={`/u/${author.username}`} className="font-medium hover:underline">{author.name || author.username}</Link>
            {author.isSystem ? <Badge variant="secondary">LazyPrompt</Badge> : null}
            <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">{comment.timeLabel}</time>
            {comment.editedAt ? <span className="text-xs text-muted-foreground">(edited)</span> : null}
            {comment.status === "pending" && comment.isOwn ? <Badge variant="outline">Pending review</Badge> : null}
            {hidden ? <Badge variant="outline">{comment.status}</Badge> : null}
          </div>

          {editing ? (
            <div className="space-y-2">
              <label htmlFor={editId} className="sr-only">Edit your comment</label>
              <Textarea id={editId} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
                aria-invalid={draft.length > COMMENT_MAX || Boolean(editError)} autoFocus />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">{draft.length}/{COMMENT_MAX}</span>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setEditing(false); setDraft(comment.body); setEditError(null); }}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={saveEdit}
                    disabled={pending || !draft.trim() || draft.length > COMMENT_MAX}>
                    Save
                  </Button>
                </div>
              </div>
              {editError ? <p role="alert" className="text-sm text-destructive">{editError}</p> : null}
            </div>
          ) : (
            <Linkify text={comment.body} className="block whitespace-pre-wrap break-words text-sm" />
          )}

          {!editing ? (
            <div className="-ml-2 flex flex-wrap items-center gap-1">
              {depth === 0 && signedIn && !hidden ? (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"
                  onClick={() => setReplying((v) => !v)} aria-expanded={replying}>
                  <Reply /> Reply
                </Button>
              ) : null}
              {comment.canEdit ? (
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"
                  onClick={() => { setDraft(comment.body); setEditing(true); }}>
                  <Pencil /> Edit
                </Button>
              ) : null}
              {comment.isOwn && !hidden ? (
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground"><Trash2 /> Delete</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {depth === 0 && comment.replies.length > 0
                          ? "Replies to it will stay visible."
                          : "This cannot be undone."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" disabled={pending}
                        onClick={(e) => { e.preventDefault(); remove(); }}>
                        Delete comment
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {!comment.isOwn && !hidden ? <ReportButton targetType="comment" targetId={comment.id} signedIn={signedIn} /> : null}
            </div>
          ) : null}

          {replying && depth === 0 ? (
            <div className="pt-1">
              <CommentForm
                promptId={promptId} slug={slug} parentId={comment.id} label={`Reply to ${author.name || author.username}`}
                submitLabel="Post reply" autoFocus onDone={() => setReplying(false)} onCancel={() => setReplying(false)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {comment.replies.length > 0 ? (
        <ul className="ml-4 space-y-4 border-l pl-4 sm:ml-11" aria-label="Replies">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} promptId={promptId} slug={slug} signedIn={signedIn} depth={1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
