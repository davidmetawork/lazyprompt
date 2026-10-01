import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import type { ActionResult, ErrorCode } from "./types";

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
  }
}

/** Stub marker used by packages that replace the implementation later. Always throws. */
export function notImplemented(name: string): never {
  throw new Error(`${name} is not implemented yet`);
}

function fieldErrorsFromZod(e: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of e.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_root";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Wraps a server-action body into an ActionResult. Navigation errors (redirect(), notFound(), forbidden())
 * are rethrown first so they still navigate instead of becoming INTERNAL.
 */
export async function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) {
      return { ok: false, code: e.code, message: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) };
    }
    if (e instanceof ZodError) {
      return { ok: false, code: "VALIDATION", message: "Please check the highlighted fields", fieldErrors: fieldErrorsFromZod(e) };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, code: "INTERNAL", message: "Something went wrong" };
  }
}
