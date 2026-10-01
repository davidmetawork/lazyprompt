"use client";

import { useId, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation dialog with an optional or required reason. `onConfirm` resolves to true when the action
 * succeeded (the dialog then closes); on failure it stays open so the admin can retry.
 */
export function ReasonDialog({
  trigger, title, description, confirmLabel, reasonLabel = "Reason", reasonHelp, reasonRequired = false,
  destructive = true, busy = false, onConfirm, children,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  reasonLabel?: string;
  reasonHelp?: string;
  reasonRequired?: boolean;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => Promise<boolean>;
  /** Extra fields rendered above the reason (for example a version number). */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fieldId = useId();
  const trimmed = reason.trim();
  const invalid = reasonRequired && trimmed.length < 3;

  async function submit() {
    if (invalid || submitting) return;
    setSubmitting(true);
    try {
      if (await onConfirm(trimmed)) {
        setOpen(false);
        setReason("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="data-[size=default]:max-w-md data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <div className="grid gap-1.5">
          <Label htmlFor={fieldId}>{reasonLabel}{reasonRequired ? "" : " (optional)"}</Label>
          <Textarea
            id={fieldId}
            value={reason}
            maxLength={500}
            required={reasonRequired}
            aria-required={reasonRequired}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          />
          {reasonHelp ? <p className="text-xs text-muted-foreground">{reasonHelp}</p> : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={invalid || submitting || busy}
            onClick={() => void submit()}
          >
            {submitting ? "Working..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
