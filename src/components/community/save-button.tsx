"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import { setSavedAction } from "@/actions/saves";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signInHref } from "./helpers";
import { useActionFailure } from "./use-action-failure";

export interface SaveButtonProps { promptId: string; slug: string; saved: boolean; saveCount: number; signedIn: boolean }

interface SaveState { saved: boolean; saveCount: number }

export function SaveButton({ promptId, slug, saved, saveCount, signedIn }: SaveButtonProps) {
  const fail = useActionFailure();
  const [pending, startTransition] = useTransition();
  const [server, setServer] = useState<SaveState>({ saved, saveCount });
  const [state, setOptimistic] = useOptimistic(server, (_p: SaveState, next: SaveState) => next);

  // Server props win whenever they change (after revalidation): adjust state during render, not in an effect.
  const propsKey = `${saved}:${saveCount}`;
  const [seenKey, setSeenKey] = useState(propsKey);
  if (seenKey !== propsKey) {
    setSeenKey(propsKey);
    setServer({ saved, saveCount });
  }

  if (!signedIn) {
    return (
      <Link href={signInHref(`/p/${slug}`)} className={cn(buttonVariants({ variant: "outline" }))}
        aria-label={`Sign in to save this prompt (${saveCount} saves)`}>
        <Bookmark /> Save <span className="tabular-nums text-muted-foreground">{saveCount}</span>
      </Link>
    );
  }

  function toggle() {
    if (pending) return;
    const next = !state.saved;
    startTransition(async () => {
      setOptimistic({ saved: next, saveCount: Math.max(0, state.saveCount + (next ? 1 : -1)) });
      const r = await setSavedAction({ promptId, slug, saved: next });
      if (r.ok) setServer(r.data);
      else fail(r, "Could not update your saved prompts");
    });
  }

  return (
    <Button type="button" variant={state.saved ? "secondary" : "outline"} aria-pressed={state.saved} onClick={toggle}>
      <Bookmark className={state.saved ? "fill-current" : undefined} />
      {state.saved ? "Saved" : "Save"}
      <span className="tabular-nums text-muted-foreground" aria-label={`${state.saveCount} saves`}>{state.saveCount}</span>
    </Button>
  );
}
