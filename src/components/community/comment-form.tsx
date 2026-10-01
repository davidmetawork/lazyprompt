"use client";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { createCommentAction } from "@/actions/comments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX } from "./helpers";
import { useActionFailure } from "./use-action-failure";

export interface CommentFormProps {
  promptId: string;
  slug: string;
  /** Present when replying; always the id of a top-level comment. */
  parentId?: string;
  label?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onDone?: () => void;
  onCancel?: () => void;
}

export function CommentForm({
  promptId, slug, parentId, label = "Add a comment", submitLabel = "Post comment", autoFocus, onDone, onCancel,
}: CommentFormProps) {
  const fail = useActionFailure();
  const id = useId();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trimmed = body.trim();
  const over = body.length > COMMENT_MAX;

  function submit() {
    if (!trimmed || over) return;
    setError(null);
    startTransition(async () => {
      const r = await createCommentAction({ promptId, slug, parentId, body: trimmed });
      if (r.ok) {
        setBody("");
        toast.success(r.data.status === "pending" ? "Thanks! Your comment is awaiting review" : "Comment posted");
        onDone?.();
        return;
      }
      if (r.code === "VALIDATION") setError(r.fieldErrors ? Object.values(r.fieldErrors).flat().join(" ") : r.message);
      else if (r.code === "RATE_LIMITED") setError(r.message);
      else fail(r, "Could not post your comment");
    });
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="space-y-2"
    >
      <Label htmlFor={id} className={parentId ? "sr-only" : undefined}>{label}</Label>
      <Textarea
        id={id} name="body" rows={parentId ? 2 : 3} value={body} autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value)} aria-invalid={over || Boolean(error)}
        aria-describedby={`${id}-count`} placeholder={parentId ? "Write a reply" : "Share how this prompt worked for you"}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-count`} className={over ? "text-xs text-destructive tabular-nums" : "text-xs text-muted-foreground tabular-nums"}>
          {body.length}/{COMMENT_MAX}
        </p>
        <div className="flex items-center gap-2">
          {onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
          <Button type="submit" size="sm" disabled={pending || !trimmed || over}>
            {pending ? "Posting..." : submitLabel}
          </Button>
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
