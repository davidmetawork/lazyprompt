// Application tables, EXACTLY as in docs/ARCHITECTURE.md section 3.
// Relative imports only, so drizzle-kit can load this file.
import { sql } from "drizzle-orm";
import { pgTable, pgEnum, uuid, text, varchar, integer, smallint, real, doublePrecision, boolean, jsonb, timestamp,
  date, bigserial, primaryKey, index, uniqueIndex, check, customType, type AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import * as C from "../../lib/constants";
import type { VariableDef } from "../../lib/types";

const ts = (n: string) => timestamp(n, { withTimezone: true, mode: "date" });
const citext = customType<{ data: string }>({ dataType: () => "citext" });
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const aiModel = pgEnum("ai_model", C.AI_MODELS);
export const useCase = pgEnum("use_case", C.USE_CASES);
export const promptStatus = pgEnum("prompt_status", C.PROMPT_STATUSES);
export const commentStatus = pgEnum("comment_status", C.COMMENT_STATUSES);
export const license = pgEnum("license", C.LICENSES);
export const usageEventType = pgEnum("usage_event_type", C.USAGE_EVENT_TYPES);
export const eventSource = pgEnum("event_source", C.EVENT_SOURCES);
export const reportTarget = pgEnum("report_target", C.REPORT_TARGETS);
export const reportReason = pgEnum("report_reason", C.REPORT_REASONS);
export const reportStatus = pgEnum("report_status", C.REPORT_STATUSES);
export const modAction = pgEnum("mod_action", C.MOD_ACTIONS);

export const profiles = pgTable("profiles", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  username: citext("username").notNull().unique(),          // ^[a-z0-9][a-z0-9_-]{2,29}$
  bio: varchar("bio", { length: 280 }),
  website: varchar("website", { length: 200 }),
  trustLevel: smallint("trust_level").notNull().default(0),  // 0 new, 1 member, 2 trusted, 3 staff/system
  isSystem: boolean("is_system").notNull().default(false),
  publishedPromptCount: integer("published_prompt_count").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [check("profiles_trust_range", sql`${t.trustLevel} between 0 and 3`)]);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 48 }).notNull().unique(),
  name: varchar("name", { length: 60 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  icon: varchar("icon", { length: 40 }).notNull(),           // lucide icon name
  sortOrder: integer("sort_order").notNull().default(0),
  promptCount: integer("prompt_count").notNull().default(0), // published only
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 32 }).notNull().unique(), // normalized lowercase-hyphen
  name: varchar("name", { length: 32 }).notNull(),
  promptCount: integer("prompt_count").notNull().default(0),
  aliasOfId: uuid("alias_of_id").references((): AnyPgColumn => tags.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("tags_slug_trgm_idx").using("gin", sql`${t.slug} gin_trgm_ops`)]);

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  shortId: varchar("short_id", { length: 12 }).notNull().unique(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  seedKey: varchar("seed_key", { length: 80 }).unique(),       // only for seeded prompts
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  body: text("body").notNull(),
  variables: jsonb("variables").$type<VariableDef[]>().notNull().default(sql`'[]'::jsonb`),
  exampleOutput: text("example_output"),
  notes: text("notes"),                                         // "why it works" / tips
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "restrict" }),
  useCase: useCase("use_case").notNull(),
  license: license("license").notNull().default("cc_by_4"),
  language: varchar("language", { length: 8 }).notNull().default("en"),
  status: promptStatus("status").notNull().default("pending"),
  version: integer("version").notNull().default(1),
  forkedFromId: uuid("forked_from_id").references((): AnyPgColumn => prompts.id, { onDelete: "set null" }),
  forkedFromVersion: integer("forked_from_version"),
  isFeatured: boolean("is_featured").notNull().default(false),
  tagsText: text("tags_text").notNull().default(""),            // space-joined tag names, maintained by server
  search: tsvector("search").generatedAlwaysAs(sql`
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("tags_text", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("body", '')), 'C')`),
  // denormalized counters / scores
  ratingCount: integer("rating_count").notNull().default(0),
  ratingSum: integer("rating_sum").notNull().default(0),
  ratingWeightSum: real("rating_weight_sum").notNull().default(0),
  ratingWeightedSum: real("rating_weighted_sum").notNull().default(0),
  bayesScore: doublePrecision("bayes_score").notNull().default(0),
  trendingScore: doublePrecision("trending_score").notNull().default(0),
  copyCount: integer("copy_count").notNull().default(0),
  openCount: integer("open_count").notNull().default(0),
  renderCount: integer("render_count").notNull().default(0),    // MCP render_prompt
  workedCount: integer("worked_count").notNull().default(0),
  notWorkedCount: integer("not_worked_count").notNull().default(0),
  saveCount: integer("save_count").notNull().default(0),
  commentCount: integer("comment_count").notNull().default(0),  // visible comments
  forkCount: integer("fork_count").notNull().default(0),
  openReportCount: integer("open_report_count").notNull().default(0),
  // moderation
  moderationFlags: text("moderation_flags").array().notNull().default(sql`'{}'::text[]`),
  moderationNote: text("moderation_note"),
  duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => prompts.id, { onDelete: "set null" }),
  reviewedById: text("reviewed_by_id").references(() => user.id, { onDelete: "set null" }),
  reviewedAt: ts("reviewed_at"),
  autoHiddenAt: ts("auto_hidden_at"),
  /** First version an admin (or a trusted author's clean publish) made public; earlier versions never appear in history. */
  approvedFromVersion: integer("approved_from_version"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  publishedAt: ts("published_at"),
  removedAt: ts("removed_at"),
}, (t) => [
  index("prompts_search_idx").using("gin", t.search),
  index("prompts_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
  index("prompts_top_idx").on(t.bayesScore.desc(), t.isFeatured.desc(), t.copyCount.desc()).where(sql`${t.status} = 'published'`),
  index("prompts_trending_idx").on(t.trendingScore.desc()).where(sql`${t.status} = 'published'`),
  index("prompts_new_idx").on(t.publishedAt.desc()).where(sql`${t.status} = 'published'`),
  index("prompts_category_status_idx").on(t.categoryId, t.status),
  index("prompts_author_idx").on(t.authorId, t.createdAt.desc()),
  index("prompts_status_created_idx").on(t.status, t.createdAt),
  index("prompts_forked_from_idx").on(t.forkedFromId),
  check("prompts_version_pos", sql`${t.version} >= 1`),
]);

export const promptVersions = pgTable("prompt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  description: varchar("description", { length: 300 }).notNull(),
  body: text("body").notNull(),
  variables: jsonb("variables").$type<VariableDef[]>().notNull(),
  exampleOutput: text("example_output"),
  notes: text("notes"),
  changeNote: varchar("change_note", { length: 200 }),
  editorId: text("editor_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("prompt_versions_prompt_version_uq").on(t.promptId, t.version)]);

export const promptTags = pgTable("prompt_tags", {
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.promptId, t.tagId] }), index("prompt_tags_tag_idx").on(t.tagId)]);

export const promptModels = pgTable("prompt_models", {     // no rows = "works with any model"
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  model: aiModel("model").notNull(),
  testedVersion: varchar("tested_version", { length: 60 }), // e.g. "GPT-5.2", optional
  testedAt: date("tested_at", { mode: "string" }),
}, (t) => [primaryKey({ columns: [t.promptId, t.model] }), index("prompt_models_model_idx").on(t.model)]);

export const ratings = pgTable("ratings", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  stars: smallint("stars").notNull(),
  weight: real("weight").notNull().default(1),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.userId, t.promptId] }),
  index("ratings_prompt_idx").on(t.promptId, t.createdAt),
  check("ratings_stars_range", sql`${t.stars} between 1 and 5`),
]);

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  authorId: text("author_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
  depth: smallint("depth").notNull().default(0),           // 0 top-level, 1 reply; replies to replies forbidden
  body: varchar("body", { length: 2000 }).notNull(),
  status: commentStatus("status").notNull().default("visible"),
  moderationFlags: text("moderation_flags").array().notNull().default(sql`'{}'::text[]`),
  openReportCount: integer("open_report_count").notNull().default(0),
  editedAt: ts("edited_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  index("comments_prompt_idx").on(t.promptId, t.createdAt),
  index("comments_parent_idx").on(t.parentId),
  index("comments_status_idx").on(t.status, t.createdAt),
  check("comments_depth_range", sql`${t.depth} in (0, 1)`),
  check("comments_parent_depth", sql`(${t.depth} = 0) = (${t.parentId} is null)`),
]);

export const saves = pgTable("saves", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.promptId] }), index("saves_user_idx").on(t.userId, t.createdAt.desc())]);

export const usageEvents = pgTable("usage_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  promptId: uuid("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
  type: usageEventType("type").notNull(),
  model: aiModel("model"),
  source: eventSource("source").notNull().default("web"),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  actorHash: varchar("actor_hash", { length: 64 }).notNull(), // sha256(userId | ip+ua, IP_HASH_SALT); no raw IP stored
  day: date("day", { mode: "string" }).notNull().default(sql`current_date`),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("usage_events_dedupe_uq").on(t.promptId, t.type, t.actorHash, t.day),
  index("usage_events_created_idx").on(t.createdAt),
  index("usage_events_prompt_created_idx").on(t.promptId, t.createdAt),
]);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterId: text("reporter_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  targetType: reportTarget("target_type").notNull(),
  targetId: text("target_id").notNull(),                   // prompt uuid, comment uuid or user id
  promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "cascade" }), // context for prompt/comment
  reason: reportReason("reason").notNull(),
  details: varchar("details", { length: 1000 }),
  status: reportStatus("status").notNull().default("open"),
  resolvedById: text("resolved_by_id").references(() => user.id, { onDelete: "set null" }),
  resolvedAt: ts("resolved_at"),
  resolutionNote: varchar("resolution_note", { length: 500 }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("reports_open_once_uq").on(t.reporterId, t.targetType, t.targetId).where(sql`${t.status} = 'open'`),
  index("reports_status_idx").on(t.status, t.createdAt),
  index("reports_target_idx").on(t.targetType, t.targetId),
]);

export const moderationActions = pgTable("moderation_actions", {   // append-only audit log
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }), // null = system
  targetType: reportTarget("target_type").notNull(),
  targetId: text("target_id").notNull(),
  action: modAction("action").notNull(),
  reason: varchar("reason", { length: 500 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("mod_actions_target_idx").on(t.targetType, t.targetId), index("mod_actions_created_idx").on(t.createdAt.desc())]);

export const appRateLimits = pgTable("app_rate_limits", {   // fixed-window counters for app actions
  key: varchar("key", { length: 200 }).primaryKey(),        // `${action}:${subject}`
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
});

export const appSettings = pgTable("app_settings", {        // 'ranking.globalMean', 'ranking.computedAt'
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
