"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check, EyeOff, Eraser, Pencil, RotateCcw, Star, Trash2 } from "lucide-react";
import { moderatePromptAction, redactPromptVersionAction } from "@/actions/admin";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PromptStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

/** Redacts one earlier version of the prompt (the current version is edited or removed instead). */
function RedactVersion({ id, slug, title, version }: { id: string; slug: string; title: string; version: number }) {
  const { run, pending } = useAdminAction();
  const [target, setTarget] = useState("1");
  const fieldId = useId();
  const n = Number(target);
  return (
    <ReasonDialog
      trigger={<Button type="button" size="xs" variant="outline"><Eraser /> Redact version</Button>}
      title="Redact an earlier version?"
      description={<>The text of the chosen version of &ldquo;{title}&rdquo; is replaced with [redacted] in its public history. This can&apos;t be undone.</>}
      confirmLabel="Redact version"
      reasonRequired
      busy={pending || !Number.isInteger(n) || n < 1 || n >= version}
      onConfirm={(reason) => run(() => redactPromptVersionAction({ promptId: id, slug, version: n, reason }), `Version ${n} redacted`)}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={fieldId}>Version to redact (1 to {version - 1})</Label>
        <Input id={fieldId} type="number" min={1} max={version - 1} value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
    </ReasonDialog>
  );
}

export function PromptRowActions({
  id, slug, title, status, isFeatured, version = 1,
}: { id: string; slug: string; title: string; status: PromptStatus; isFeatured: boolean; version?: number }) {
  const { run, pending } = useAdminAction();
  const act = (action: "approve" | "hide" | "restore" | "remove" | "feature" | "unfeature", reason: string | undefined, done: string) =>
    run(() => moderatePromptAction({ promptId: id, slug, action, reason }), done);

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={`Actions for ${title}`}>
      {status === "pending" || status === "rejected" ? (
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
      {status === "hidden" || status === "removed" ? (
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
      {version > 1 ? <RedactVersion id={id} slug={slug} title={title} version={version} /> : null}
      <Link href={`/p/${slug}/edit`} className={buttonVariants({ variant: "ghost", size: "xs" })}>
        <Pencil /> Edit
      </Link>
    </div>
  );
}
