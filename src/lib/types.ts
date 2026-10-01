import type {
  AI_MODELS, USE_CASES, PROMPT_STATUSES, SORT_KEYS, REPORT_TARGETS, REPORT_REASONS, REPORT_STATUSES,
  COMMENT_STATUSES, USAGE_EVENT_TYPES, EVENT_SOURCES, LICENSES, VARIABLE_TYPES,
} from "./constants";

export interface VariableDef {
  key: string;                // ^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$
  label: string;              // 1-60 chars; default = labelFromKey(key) ("target_audience" -> "Target audience")
  type: (typeof VARIABLE_TYPES)[number];
  options?: string[];         // select only; 2-20 options, each 1-60 chars
  default?: string;           // <= 500 chars
  required: boolean;          // default true unless a default is given
  help?: string;              // <= 200 chars
}

export type AiModel = (typeof AI_MODELS)[number];
export type UseCase = (typeof USE_CASES)[number];
export type PromptStatus = (typeof PROMPT_STATUSES)[number];
export type CommentStatus = (typeof COMMENT_STATUSES)[number];
export type License = (typeof LICENSES)[number];
export type SortKey = (typeof SORT_KEYS)[number];
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];
export type EventSource = (typeof EVENT_SOURCES)[number];
export type TrustLevel = 0 | 1 | 2 | 3;

export interface Viewer { id: string; name: string; email: string; image: string | null; username: string;
  role: "user" | "admin"; trustLevel: TrustLevel; createdAt: string; banned: boolean }
export interface AuthorSummary { id: string; username: string; name: string; image: string | null; isSystem: boolean }
export interface PromptCard { id: string; shortId: string; slug: string; title: string; description: string;
  category: { slug: string; name: string }; tags: string[]; models: AiModel[]; useCase: UseCase; author: AuthorSummary;
  ratingAvg: number | null; ratingCount: number; copyCount: number; saveCount: number; commentCount: number;
  variableCount: number; isFeatured: boolean; publishedAt: string | null; updatedAt: string }
export interface PromptDetail extends PromptCard { body: string; variables: VariableDef[]; exampleOutput: string | null;
  notes: string | null; license: License; version: number; status: PromptStatus; openCount: number;
  workedCount: number; notWorkedCount: number; forkCount: number;
  testedOn: { model: AiModel; version: string | null; date: string | null }[];
  forkedFrom: { slug: string; title: string; author: AuthorSummary; version: number | null } | null;
  moderationFlags: string[]; moderationNote: string | null; createdAt: string }  // flags/note only populated for author/admin callers
export interface PromptVersionSummary { version: number; title: string; changeNote: string | null; createdAt: string; editor: AuthorSummary | null }
export interface PromptVersionDetail extends PromptVersionSummary { description: string; body: string;
  variables: VariableDef[]; exampleOutput: string | null; notes: string | null }
export interface Paginated<T> { items: T[]; page: number; pageSize: number; total: number; hasMore: boolean }
export interface CategoryWithCount { id: string; slug: string; name: string; description: string; icon: string; promptCount: number }
export interface TagSummary { slug: string; name: string; promptCount: number }
export interface ViewerPromptState { rating: number | null; saved: boolean; isAuthor: boolean; canEdit: boolean }
export interface RatingSummary { ratingAvg: number | null; ratingCount: number; viewerRating: number | null }
export interface CommentNode { id: string; body: string; status: CommentStatus; author: AuthorSummary; createdAt: string;
  editedAt: string | null; isOwn: boolean; replies: CommentNode[] }
export interface ProfilePage { userId: string; username: string; name: string; image: string | null; bio: string | null;
  website: string | null; trustLevel: TrustLevel; joinedAt: string; publishedPromptCount: number; isSystem: boolean }
export type ScreeningFlag = "link" | "too_many_links" | "shortener" | "affiliate" | "jailbreak" | "seo_spam" | "contact_info"
  | "shouting" | "repetition" | "duplicate" | "openai_flagged" | "new_user";
export interface ScreeningResult { verdict: "allow" | "review" | "reject"; flags: ScreeningFlag[]; reasons: string[]; duplicateOfId?: string }
export interface ModerationQueueItem { kind: "prompt" | "comment"; id: string; title: string; excerpt: string;
  author: AuthorSummary & { trustLevel: TrustLevel; accountCreatedAt: string }; flags: string[]; createdAt: string; promptSlug: string; openReportCount: number }
export interface ReportItem { id: string; targetType: ReportTarget; targetId: string; reason: ReportReason; details: string | null;
  status: ReportStatus; reporter: AuthorSummary; target: { label: string; href: string; status: string }; createdAt: string; sameTargetOpenCount: number }
export interface AdminStats { pendingPrompts: number; pendingComments: number; openReports: number; hiddenPrompts: number;
  usersTotal: number; usersLast7d: number; promptsPublished: number; events7d: Record<UsageEventType, number> }
export interface AdminUserRow { id: string; email: string; name: string; username: string; role: string; trustLevel: TrustLevel;
  banned: boolean; createdAt: string; promptCount: number }
export interface ModerationLogItem { id: string; actor: AuthorSummary | null; targetType: ReportTarget; targetId: string;
  action: string; reason: string | null; createdAt: string; target: { label: string; href: string } }
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "RATE_LIMITED" | "CONFLICT" | "BANNED" | "INTERNAL";
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };
