"use client";
import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/types";
import { signInHref } from "./helpers";

export type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

/**
 * Shared failure handling for client callers of server actions (ARCHITECTURE.md section 8): an expired session
 * (UNAUTHENTICATED) goes to /sign-in with a safe `next`; everything else is a toast.
 * Returns true when the failure was handled by redirecting.
 */
export function useActionFailure(): (r: ActionFailure, fallback?: string) => boolean {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback((r, fallback) => {
    if (r.code === "UNAUTHENTICATED") {
      const hash = typeof window === "undefined" ? "" : window.location.hash;
      router.push(signInHref(`${pathname}${hash}`));
      return true;
    }
    toast.error(r.message || fallback || "Something went wrong");
    return false;
  }, [router, pathname]);
}
