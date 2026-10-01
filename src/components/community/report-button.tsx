// PLACEHOLDER owned by community-ui.
import type { ReportTarget } from "@/lib/types";

export interface ReportButtonProps { targetType: ReportTarget; targetId: string; signedIn: boolean }

export function ReportButton(_props: ReportButtonProps) {
  return <span className="text-sm text-muted-foreground">Report</span>;
}
