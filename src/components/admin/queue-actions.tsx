"use client";

import { Check, EyeOff, Trash2, X } from "lucide-react";
import { moderateCommentAction, moderatePromptAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { BanButton } from "./ban-dialog";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

export function QueueActions({
  kind, id, slug, authorId, authorUsername, adminId,
}: {
  kind: "prompt" | "comment";
  id: string;
  slug: string;
  authorId: string;
  authorUsername: string;
  adminId: string;
}) {
  const { run, pending } = useAdminAction();
  const label = kind === "prompt" ? "prompt" : "comment";

  const act = (action: "approve" | "hide" | "remove" | "reject", reason: string | undefined, done: string) =>
    kind === "prompt"
      ? run(() => moderatePromptAction({ promptId: id, slug, action, reason }), done)
      : run(() => moderateCommentAction({
          commentId: id, slug, action: action as "approve" | "hide" | "remove", reason,
        }), done);

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Actions for this ${label}`}>
      <Button type="button" size="sm" disabled={pending} onClick={() => void act("approve", undefined, `Approved ${label}`)}>
        <Check /> Approve
      </Button>
      {kind === "prompt" ? (
        <ReasonDialog
          trigger={<Button type="button" size="sm" variant="outline"><X /> Reject</Button>}
          title="Reject this prompt?"
          description="The author will see this reason on their My prompts page."
          confirmLabel="Reject prompt"
          reasonLabel="Reason shown to the author"
          reasonRequired
          busy={pending}
          onConfirm={(reason) => act("reject", reason, "Rejected prompt")}
        />
      ) : null}
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => void act("hide", undefined, `Hid ${label}`)}>
        <EyeOff /> Hide
      </Button>
      <ReasonDialog
        trigger={<Button type="button" size="sm" variant="destructive"><Trash2 /> Remove</Button>}
        title={`Remove this ${label}?`}
        description={`The ${label} is taken down for good and no longer appears anywhere on the site.`}
        confirmLabel={`Remove ${label}`}
        busy={pending}
        onConfirm={(reason) => act("remove", reason || undefined, `Removed ${label}`)}
      />
      {authorId !== adminId ? <BanButton userId={authorId} username={authorUsername} /> : null}
    </div>
  );
}
