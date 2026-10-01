// Pure helpers for the admin UI (no server-only, no React) so they are unit-testable.
import type { ReportItem, ReportReason, ReportStatus } from "@/lib/types";

const FLAG_LABELS: Record<string, string> = {
  link: "Contains link",
  too_many_links: "Too many links",
  shortener: "URL shortener",
  affiliate: "Affiliate link",
  jailbreak: "Jailbreak pattern",
  seo_spam: "SEO spam",
  contact_info: "Contact info",
  shouting: "Shouting",
  repetition: "Repetition",
  duplicate: "Possible duplicate",
  openai_flagged: "Flagged by moderation AI",
  new_user: "New user",
};

/** Human label for a screening flag; unknown flags fall back to a readable form of the slug. */
export function flagLabel(flag: string): string {
  const known = FLAG_LABELS[flag];
  if (known) return known;
  const spaced = flag.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Unknown flag";
}

const REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  broken: "Broken or not working",
  jailbreak: "Jailbreak",
  nsfw: "NSFW",
  harassment: "Harassment",
  copyright: "Copyright",
  personal_data: "Personal data",
  other: "Other",
};

export function reportReasonLabel(reason: string): string {
  return REASON_LABELS[reason as ReportReason] ?? flagLabel(reason);
}

export const REPORT_STATUS_FILTERS: readonly ReportStatus[] = ["open", "actioned", "dismissed"];

export function parseReportStatus(raw: string | undefined): ReportStatus {
  return REPORT_STATUS_FILTERS.find((s) => s === raw) ?? "open";
}

export interface ReportGroup {
  key: string;
  targetType: ReportItem["targetType"];
  targetId: string;
  target: ReportItem["target"];
  reports: ReportItem[];
  sameTargetOpenCount: number;
}

/** Groups reports by (targetType, targetId), keeping first-seen order of targets and of reports within a group. */
export function groupReportsByTarget(reports: readonly ReportItem[]): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const r of reports) {
    const key = `${r.targetType}:${r.targetId}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, targetType: r.targetType, targetId: r.targetId, target: r.target, reports: [], sameTargetOpenCount: 0 };
      groups.set(key, g);
    }
    g.reports.push(r);
    g.sameTargetOpenCount = Math.max(g.sameTargetOpenCount, r.sameTargetOpenCount);
  }
  return [...groups.values()];
}

/** Compact "3d", "5h", "12m" age for dense tables. `now` is injectable for tests. */
export function formatAge(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d`;
  return `${Math.floor(d / 365)}y`;
}

/** Stable absolute timestamp (UTC) so server and client render the same text. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function pageParam(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(v ?? "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 50) : 1;
}

export function firstParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const t = v?.trim();
  return t ? t.slice(0, 200) : undefined;
}

/** "set_trust" -> "Set trust". */
export function actionLabel(action: string): string {
  return flagLabel(action);
}

/** Extracts the prompt slug from a `/p/<slug>` link, so server actions can revalidate the public page. */
export function slugFromHref(href: string): string | undefined {
  const m = /^\/p\/([a-z0-9-]+)(?:[/?#]|$)/.exec(href);
  return m?.[1];
}
