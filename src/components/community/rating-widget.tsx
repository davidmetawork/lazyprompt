"use client";
import { useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { removeRatingAction, rateAction } from "@/actions/ratings";
import { Button } from "@/components/ui/button";
import { StarsDisplay } from "@/components/ui/stars-display";
import { trackEvent } from "@/lib/analytics";
import type { RatingSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { applyRating, signInHref } from "./helpers";
import { useActionFailure } from "./use-action-failure";

export interface RatingWidgetProps {
  promptId: string; slug: string; ratingAvg: number | null; ratingCount: number;
  viewerRating: number | null; signedIn: boolean; isAuthor: boolean;
}

const LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

export function RatingWidget({ promptId, slug, ratingAvg, ratingCount, viewerRating, signedIn, isAuthor }: RatingWidgetProps) {
  const fail = useActionFailure();
  const [pending, startTransition] = useTransition();
  const [server, setServer] = useState<RatingSummary>({ ratingAvg, ratingCount, viewerRating });
  const [summary, setOptimistic] = useOptimistic(server, (_prev: RatingSummary, next: RatingSummary) => next);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Server props win whenever they change (after revalidation): adjust state during render, not in an effect.
  const propsKey = `${ratingAvg}:${ratingCount}:${viewerRating}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setServer({ ratingAvg, ratingCount, viewerRating });
  }

  if (!signedIn) {
    return (
      <div id="rate" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarsDisplay rating={ratingAvg} count={ratingCount} size={18} />
        <Link href={signInHref(`/p/${slug}#rate`)} className="text-sm text-primary underline-offset-4 hover:underline">
          Sign in to rate
        </Link>
      </div>
    );
  }

  if (isAuthor) {
    return (
      <div id="rate" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarsDisplay rating={ratingAvg} count={ratingCount} size={18} />
        <span className="text-sm text-muted-foreground">You can&apos;t rate your own prompt</span>
      </div>
    );
  }

  function commit(stars: number) {
    if (pending) return;
    startTransition(async () => {
      setOptimistic(applyRating(summary, stars));
      const r = await rateAction({ promptId, slug, stars });
      if (r.ok) {
        setServer(r.data);
        trackEvent("prompt_rate", { stars });
      } else {
        fail(r, "Could not save your rating");
      }
    });
  }

  function clear() {
    if (pending) return;
    startTransition(async () => {
      setOptimistic(applyRating(summary, null));
      const r = await removeRatingAction({ promptId, slug });
      if (r.ok) setServer(r.data);
      else fail(r, "Could not clear your rating");
    });
  }

  const current = summary.viewerRating;
  const shown = hover ?? focusIndex ?? current ?? 0;
  const tabStop = (current ?? 1) - 1;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") target = Math.min(4, index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") target = Math.max(0, index - 1);
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = 4;
    else if (/^[1-5]$/.test(e.key)) {
      e.preventDefault();
      commit(Number(e.key));
      return;
    }
    if (target !== null) {
      e.preventDefault();
      refs.current[target]?.focus();
    }
  }

  return (
    <div id="rate" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          role="radiogroup" aria-label="Rate this prompt" aria-busy={pending}
          className="inline-flex" onMouseLeave={() => setHover(null)}
        >
          {[1, 2, 3, 4, 5].map((n, i) => (
            <button
              key={n} type="button" role="radio" aria-checked={current === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}, ${LABELS[i]}`}
              tabIndex={i === tabStop ? 0 : -1}
              ref={(el) => { refs.current[i] = el; }}
              onClick={() => commit(n)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setFocusIndex(n)}
              onBlur={() => setFocusIndex(null)}
              className="rounded-md p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Star
                className={cn("size-6 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        <StarsDisplay rating={summary.ratingAvg} count={summary.ratingCount} size={14} />
      </div>
      <div className="flex min-h-7 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {current ? (
          <>
            <span>Your rating: {current} of 5</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={clear} disabled={pending}>
              Clear rating
            </Button>
          </>
        ) : (
          <span>{hover ? LABELS[hover - 1] : "Click a star to rate"}</span>
        )}
      </div>
    </div>
  );
}
