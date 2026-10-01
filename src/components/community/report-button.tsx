"use client";
import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag } from "lucide-react";
import { toast } from "sonner";
import { createReportAction } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { REPORT_REASONS } from "@/lib/constants";
import type { ReportTarget } from "@/lib/types";
import { REPORT_DETAILS_MAX, REPORT_REASON_LABELS, signInHref } from "./helpers";
import { useActionFailure } from "./use-action-failure";

export interface ReportButtonProps { targetType: ReportTarget; targetId: string; signedIn: boolean }

const TRIGGER_CLASS = "text-muted-foreground";

export function ReportButton({ targetType, targetId, signedIn }: ReportButtonProps) {
  const pathname = usePathname();
  const fail = useActionFailure();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number] | "">("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Button asChild variant="ghost" size="sm" className={TRIGGER_CLASS}>
        <Link href={signInHref(pathname)}><Flag /> Report</Link>
      </Button>
    );
  }

  function submit() {
    if (!reason) {
      setError("Choose a reason");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await createReportAction({ targetType, targetId, reason, details: details.trim() || undefined });
      if (r.ok) {
        toast.success("Thanks, we will take a look");
        setOpen(false);
        setReason("");
        setDetails("");
      } else if (r.code === "CONFLICT") {
        setError("You already reported this");
      } else if (r.code === "VALIDATION") {
        setError(r.fieldErrors ? Object.values(r.fieldErrors).flat().join(" ") : r.message);
      } else if (!fail(r, "Could not send your report") && r.code === "RATE_LIMITED") {
        setError(r.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setError(null); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={TRIGGER_CLASS}><Flag /> Report</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report this {targetType}</DialogTitle>
          <DialogDescription>
            Tell us what is wrong. Reports are reviewed by moderators and are not shared with the author.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as (typeof REPORT_REASONS)[number])}
          aria-label="Reason for report" className="gap-2.5">
          {REPORT_REASONS.map((r) => (
            <div key={r} className="flex items-center gap-2.5">
              <RadioGroupItem value={r} id={`${uid}-${r}`} />
              <Label htmlFor={`${uid}-${r}`} className="font-normal">{REPORT_REASON_LABELS[r]}</Label>
            </div>
          ))}
        </RadioGroup>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-details`}>Details (optional)</Label>
          <Textarea id={`${uid}-details`} value={details} maxLength={REPORT_DETAILS_MAX} rows={3}
            onChange={(e) => setDetails(e.target.value)} />
          <p className="text-xs text-muted-foreground tabular-nums">{details.length}/{REPORT_DETAILS_MAX}</p>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={pending}>{pending ? "Sending..." : "Send report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
