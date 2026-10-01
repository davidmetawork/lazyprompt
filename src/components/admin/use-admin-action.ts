"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";

/**
 * Runs an admin server action, toasts the outcome, refreshes the page data and routes an expired
 * session to sign-in. Resolves to true on success so dialogs know when to close.
 */
export function useAdminAction() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    async (fn: () => Promise<ActionResult>, successMessage: string): Promise<boolean> => {
      let result: ActionResult;
      try {
        result = await fn();
      } catch {
        toast.error("Something went wrong. Please try again.");
        return false;
      }
      if (result.ok) {
        toast.success(successMessage);
        startTransition(() => router.refresh());
        return true;
      }
      if (result.code === "UNAUTHENTICATED") {
        router.push(`/sign-in?next=${encodeURIComponent(pathname)}`);
        return false;
      }
      const detail = result.fieldErrors ? Object.values(result.fieldErrors).flat()[0] : undefined;
      toast.error(detail ?? result.message);
      return false;
    },
    [router, pathname],
  );

  return { run, pending };
}
