/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write.
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { ReportInput } from "@/lib/validation";
import type { Viewer } from "@/lib/types";

export async function createReport(actor: Viewer, input: ReportInput): Promise<{ id: string; autoHidden: boolean }> {
  return notImplemented("createReport");
}
