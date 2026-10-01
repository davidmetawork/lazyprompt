"use server";
import { requireViewerForAction } from "@/auth/viewer";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { reportInputSchema, type ReportInput } from "@/lib/validation";
import { createReport } from "@/server/reports";

/** Reports never change what the reporter sees (auto-hide is applied server side), so nothing is revalidated. */
export async function createReportAction(input: ReportInput): Promise<ActionResult<{ id: string; autoHidden: boolean }>> {
  return toActionResult(async () => {
    const v = await requireViewerForAction();
    return createReport(v, reportInputSchema.parse(input));
  });
}
