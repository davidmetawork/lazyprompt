"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deletePromptAction } from "@/actions/prompts";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import type { PromptStatus } from "@/lib/types";
import { useActionFailure } from "./use-action-failure";

export interface AuthorActionsProps { promptId: string; shortId: string; slug: string; status: PromptStatus }

export function AuthorActions({ promptId, slug, status }: AuthorActionsProps) {
  const fail = useActionFailure();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      // On success the action redirects to /me/prompts; only failures come back here.
      const r = await deletePromptAction({ promptId, slug });
      if (!r.ok) {
        setOpen(false);
        fail(r, "Could not delete the prompt");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "published" ? <Badge variant="outline">{status}</Badge> : null}
      <Link href={`/p/${slug}/edit`} className={buttonVariants({ variant: "outline" })}><Pencil /> Edit</Link>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive"><Trash2 /> Delete</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this prompt?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from LazyPrompt and its link will stop working. This cannot be undone from the site.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending}
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}>
              {pending ? "Deleting..." : "Delete prompt"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
