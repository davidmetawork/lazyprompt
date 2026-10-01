"use client";

import { useId, useState } from "react";
import { Gavel } from "lucide-react";
import { resolveReportAction } from "@/actions/admin";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { ReportTarget } from "@/lib/types";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

export function ReportActions({
  reportId, targetType, targetId, slug,
}: { reportId: string; targetType: ReportTarget; targetId: string; slug?: string }) {
  const { run, pending } = useAdminAction();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TakeActionDialog
        reportId={reportId} targetType={targetType} targetId={targetId} slug={slug}
        run={run} pending={pending}
      />
      <ReasonDialog
        trigger={<Button type="button" size="sm" variant="outline">Dismiss</Button>}
        title="Dismiss this report?"
        description="The report is closed without touching the reported content."
        confirmLabel="Dismiss report"
        reasonLabel="Note"
        destructive={false}
        busy={pending}
        onConfirm={(note) =>
          run(() => resolveReportAction({ resolution: "dismissed", reportId, note: note || undefined, slug }), "Report dismissed")}
      />
    </div>
  );
}

function TakeActionDialog({
  reportId, targetType, targetId, slug, run, pending,
}: {
  reportId: string; targetType: ReportTarget; targetId: string; slug?: string;
  run: ReturnType<typeof useAdminAction>["run"]; pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"hide" | "remove">("hide");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const noteId = useId();
  const hideId = useId();
  const removeId = useId();
  const isUser = targetType === "user";

  async function submit() {
    setSubmitting(true);
    try {
      const ok = await run(
        () => resolveReportAction({
          resolution: "actioned", reportId, targetType, targetId,
          targetAction: isUser ? "none" : choice, note: note.trim() || undefined, slug,
        }),
        isUser ? "Report resolved" : choice === "hide" ? "Content hidden, report resolved" : "Content removed, report resolved",
      );
      if (ok) { setOpen(false); setNote(""); }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
      <AlertDialogTrigger asChild>
        <Button type="button" size="sm" variant="destructive"><Gavel /> Take action</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-md data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Take action on this report</AlertDialogTitle>
          <AlertDialogDescription>
            {isUser
              ? "User reports are resolved as actioned here. Use the Users page to ban the account."
              : "Choose what happens to the reported content. All open reports for it are resolved."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isUser ? null : (
          <RadioGroup value={choice} onValueChange={(v) => setChoice(v === "remove" ? "remove" : "hide")} aria-label="Action on the reported content">
            <div className="flex items-start gap-2">
              <RadioGroupItem value="hide" id={hideId} className="mt-0.5" />
              <Label htmlFor={hideId} className="grid gap-0.5 font-normal">
                <span className="font-medium">Hide</span>
                <span className="text-xs text-muted-foreground">Reversible. Can be restored later.</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="remove" id={removeId} className="mt-0.5" />
              <Label htmlFor={removeId} className="grid gap-0.5 font-normal">
                <span className="font-medium">Remove</span>
                <span className="text-xs text-muted-foreground">Taken down for good.</span>
              </Label>
            </div>
          </RadioGroup>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={noteId}>Note (optional)</Label>
          <Textarea id={noteId} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={submitting || pending} onClick={() => void submit()}>
            {submitting ? "Working..." : isUser ? "Resolve as actioned" : choice === "hide" ? "Hide content" : "Remove content"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
