"use client";

import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AiModel } from "@/lib/types";
import { sendUsageEvent } from "./use-usage";

/** "Did it work?" shown after a copy or open. One vote per mount; sends worked / not_worked. */
export function FeedbackBar({ promptId, model }: { promptId: string; model?: AiModel }) {
  const [voted, setVoted] = useState<"worked" | "not_worked" | null>(null);

  function vote(type: "worked" | "not_worked") {
    if (voted) return;
    setVoted(type);
    sendUsageEvent({ promptId, type, ...(model ? { model } : {}) });
  }

  return (
    <div role="status" aria-live="polite" data-testid="feedback-bar"
      className="flex items-center justify-between gap-3 rounded-lg border bg-accent/40 px-3 py-2 text-sm">
      {voted ? (
        <span>Thanks for the feedback.</span>
      ) : (
        <>
          <span className="font-medium">Did it work?</span>
          <span className="flex gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => vote("worked")}>
              <ThumbsUp className="size-3.5" aria-hidden="true" /> Yes
              <span className="sr-only">, it worked</span>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => vote("not_worked")}>
              <ThumbsDown className="size-3.5" aria-hidden="true" /> No
              <span className="sr-only">, it did not work</span>
            </Button>
          </span>
        </>
      )}
    </div>
  );
}
