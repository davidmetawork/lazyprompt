import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PromptStatus } from "@/lib/types";

const COPY: Partial<Record<PromptStatus, { title: string; body: string }>> = {
  draft: { title: "Draft", body: "This prompt is a draft and is only visible to you." },
  pending: { title: "Pending review", body: "A moderator will review this prompt before it goes public. Only you and moderators can see this page." },
  rejected: { title: "Rejected", body: "This prompt was not approved, so it is not public. You can edit it and resubmit." },
  hidden: { title: "Hidden", body: "This prompt is hidden from the public. Only the author and moderators can see this page." },
  removed: { title: "Removed", body: "This prompt was removed. Only moderators can see this page." },
};

/** Shown above non-published prompts. The moderator note is only passed in for the author. */
export function StatusBanner({ status, note }: { status: PromptStatus; note?: string | null }) {
  const copy = COPY[status];
  if (!copy) return null;
  return (
    <Alert variant={status === "pending" || status === "draft" ? "default" : "destructive"} data-testid="status-banner">
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {copy.body}
        {note ? <span className="mt-1 block font-medium">Moderator note: {note}</span> : null}
      </AlertDescription>
    </Alert>
  );
}
