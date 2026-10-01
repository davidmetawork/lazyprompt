"use client";

import Link from "next/link";
import { Check, EyeOff, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { moderatePromptAction } from "@/actions/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PromptStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

export function PromptRowActions({
  id, slug, title, status, isFeatured,
}: { id: string; slug: string; title: string; status: PromptStatus; isFeatured: boolean }) {
  const { run, pending } = useAdminAction();
  const act = (action: "approve" | "hide" | "restore" | "remove" | "feature" | "unfeature", reason: string | undefined, done: string) =>
    run(() => moderatePromptAction({ promptId: id, slug, action, reason }), done);

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Actions for ${title}`}>
      {status === "pending" ? (
        <Button type="button" size="xs" disabled={pending} onClick={() => void act("approve", undefined, "Approved prompt")}>
          <Check /> Approve
        </Button>
      ) : null}
      {status === "published" ? (
        <Button
          type="button" size="xs" variant="outline" disabled={pending} aria-pressed={isFeatured}
          onClick={() => void act(isFeatured ? "unfeature" : "feature", undefined, isFeatured ? "Removed from featured" : "Featured prompt")}
        >
          <Star className={cn(isFeatured && "fill-current")} /> {isFeatured ? "Unfeature" : "Feature"}
        </Button>
      ) : null}
      {status === "published" || status === "pending" ? (
        <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => void act("hide", undefined, "Prompt hidden")}>
          <EyeOff /> Hide
        </Button>
      ) : null}
      {status === "hidden" || status === "removed" || status === "rejected" ? (
        <Button type="button" size="xs" variant="outline" disabled={pending} onClick={() => void act("restore", undefined, "Prompt restored")}>
          <RotateCcw /> Restore
        </Button>
      ) : null}
      {status !== "removed" ? (
        <ReasonDialog
          trigger={<Button type="button" size="xs" variant="destructive"><Trash2 /> Remove</Button>}
          title="Remove this prompt?"
          description={<>&ldquo;{title}&rdquo; is taken down and no longer appears anywhere on the site.</>}
          confirmLabel="Remove prompt"
          busy={pending}
          onConfirm={(reason) => act("remove", reason || undefined, "Prompt removed")}
        />
      ) : null}
      <Link href={`/p/${slug}/edit`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
        <Pencil /> Edit
      </Link>
    </div>
  );
}
