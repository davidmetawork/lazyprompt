# LazyPrompt v1 Architecture

Status: approved design for the v1 rebuild on branch `claude/lazyprompt-v2`. Date: 2026-10-01.
Research inputs: `docs/research/{stack,chatgpt-app,product}.md`. Where this file and the research disagree, this file wins.
Revised 2026-10-01 after the senior advisor review; §24 lists what changed. The build orchestration (worktrees, merge order, captain checks) is in §23.

## 1. Product scope

LazyPrompt is a free community library of AI prompts. Anyone can browse, search, fill in and copy a prompt without logging in. Signing in is required to submit, edit, rate (1-5 stars), comment, save, fork and report. There are no payments in v1. LazyPrompt never runs an LLM itself. "Use" means filling in variables in the browser and then copying the text, or opening it prefilled in ChatGPT, Claude, Grok or Perplexity. Other models use copy plus opening the model's own site.

**v1 must-haves**
- Browse with category, tag, model and use-case filters; sorts Top, Trending, New and Relevance; Postgres full-text search plus trigram matching.
- Prompt page: body, variable form, live preview, Copy, "Open in" buttons, example output, notes, target models, rating, comments, save, fork, report, version history.
- Accounts: Google, GitHub and email magic link. Profile pages, saved prompts and the user's own prompts.
- Submit/edit with inline variable syntax, automatic screening, a moderation queue for low-trust users, rate limits.
- Admin: queue, reports, prompt/user management, audit log.
- "Worked / didn't work" one-click feedback after a copy, copy/open counters, and the ranking job.
- SEO: SSR pages, metadata, JSON-LD, sitemap, robots, OG images, RSS.
- ChatGPT App / Claude connector at `/mcp`: anonymous read tools with a widget. The OAuth write tools (`rate_prompt`, `save_prompt`) sit behind `MCP_OAUTH_ENABLED`.
- Seed: about 200 original prompts loaded by an idempotent script.

**Later (not v1):** collections, per-model variants, prompt chains, badges, browser extension, public API, i18n, embeddings or semantic search, payments, follow feeds, DMs, Turnstile (add it if spam appears), Cache Components.

## 2. Information architecture and routes

The route group `(site)` shares a header (logo, search box, Browse, Submit, user menu) and a footer. Every page is SSR and dynamic (see §9).

| Route | Purpose | Auth | Owner pkg |
|---|---|---|---|
| `/` | Hero + search, Featured, Trending, Top, New, category grid | public | browse |
| `/prompts` | Browse/search. Query params: `q, category, tag, model, use, sort, page` | public | browse |
| `/c/[category]` | Category landing (same list, canonical, ItemList JSON-LD) | public | browse |
| `/t/[tag]` | Tag landing (noindex if fewer than 5 prompts) | public | browse |
| `/p/[slug]` | Prompt detail + use panel. A slug mismatch gets a 308 to the canonical slug | public (non-published visible to author/admin) | browse |
| `/p/[slug]/versions`, `/p/[slug]/versions/[version]` | Version history and the read-only old version | public | community |
| `/p/[slug]/edit` | Edit (author or admin) | user | community |
| `/submit` (`?fork=<shortId>`) | New prompt / fork | user | community |
| `/u/[username]` | Public profile + published prompts | public | community |
| `/me/prompts`, `/me/saved` | Own prompts (all statuses), saved | user | community |
| `/settings` | Username, bio, website | user | community |
| `/sign-in`, `/sign-in/check-email` | Google/GitHub/magic link; `?next=` | public | foundation |
| `/oauth/consent` | OAuth consent for MCP clients | user | mcp |
| `/apps` | How to use LazyPrompt in ChatGPT/Claude | public | mcp |
| `/about`, `/guidelines`, `/privacy`, `/terms` | Static policy pages (privacy and support contact are required for ChatGPT submission) | public | seo |
| `/admin`, `/admin/queue`, `/admin/reports`, `/admin/prompts`, `/admin/users`, `/admin/log` | Moderation | admin | admin |
| `/api/auth/[...all]` | Better Auth | - | foundation |
| `/api/events` (POST) | Copy/open/worked beacons | public | data-read |
| `/api/cron/recompute` (GET) | Ranking recompute + cleanup; `Authorization: Bearer $CRON_SECRET` | cron | data-read |
| `/api/tags/suggest` (GET `?q=`) | Tag autocomplete | public | community |
| `/api/health` | `{ok, db}` | public | foundation |
| `/mcp` (GET/POST/DELETE) | MCP server | anon + OAuth | mcp |
| `/.well-known/*` → rewrite to `/api/well-known/*` | PRM, AS metadata | public | mcp |
| `/sitemap.xml`, `/robots.txt`, `/feed.xml`, `/llms.txt`, `/opengraph-image`, `/p/[slug]/opengraph-image` | SEO | public | seo |

URL rules:
- A prompt slug is `kebab(title).slice(0,60) + "-" + shortId`. `shortId` is 7 lowercase base36 characters and never changes. Lookup always uses the shortId suffix. If the requested slug differs from the stored slug, `permanentRedirect`.
- Category URLs use the category slug. Tag URLs use the normalized tag slug.

## 3. Data model (Drizzle, complete)

Conventions:
- Explicit snake_case column names; no Drizzle `casing` option.
- App tables use `uuid` PKs. Better Auth tables use `text` ids.
- All timestamps are `timestamptz`.
- Counters are denormalized onto `prompts` and kept correct inside the same transaction as the source write.
- Migrations: `drizzle/0000_extensions.sql` (custom: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS citext;`), then `0001_init.sql` generated. The generated SQL for the `tsvector` column and the `gin_trgm_ops` index must be inspected and hand-fixed if drizzle-kit quotes them wrongly.

```ts
// src/lib/constants.ts  (single source of enum values; imported by schema, zod, UI)
export const AI_MODELS = ["chatgpt","claude","gemini","perplexity","grok","copilot","mistral","deepseek","llama",
  "midjourney","stable_diffusion","flux","sora","veo"] as const;
export const USE_CASES = ["generate","rewrite","summarize","extract","analyze","brainstorm","plan","critique",
  "translate","tutor","roleplay","system_prompt"] as const;
export const VARIABLE_TYPES = ["text","long","select","number"] as const;
export const PROMPT_STATUSES = ["draft","pending","published","rejected","hidden","removed"] as const;
export const COMMENT_STATUSES = ["visible","pending","hidden","removed"] as const;
export const LICENSES = ["cc0","cc_by_4"] as const;
export const USAGE_EVENT_TYPES = ["copy","open","render","worked","not_worked"] as const;
export const EVENT_SOURCES = ["web","mcp"] as const;
export const REPORT_TARGETS = ["prompt","comment","user"] as const;
export const REPORT_REASONS = ["spam","broken","jailbreak","nsfw","harassment","copyright","personal_data","other"] as const;
export const REPORT_STATUSES = ["open","actioned","dismissed"] as const;
export const MOD_ACTIONS = ["approve","reject","hide","restore","remove","feature","unfeature","auto_flag","auto_hide",
  "ban","unban","set_trust","resolve_report","dismiss_report"] as const;
export const SORT_KEYS = ["relevance","top","trending","new"] as const;
export const SYSTEM_USER_ID = "lp_system";
```

```ts
// src/db/schema/auth.ts — Better Auth core + admin + jwt + rateLimit.
// Must match `npx auth@latest generate`; after generating, diff and let the CLI win on names/types.
import { pgTable, text, timestamp, boolean, integer, bigint, index } from "drizzle-orm/pg-core";
const ts = (n: string) => timestamp(n, { withTimezone: true, mode: "date" });

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  role: text("role").default("user"),               // admin plugin ("user" | "admin")
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: ts("ban_expires"),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().$onUpdate(() => new Date()),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
}, (t) => [index("session_user_id_idx").on(t.userId)]);
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: ts("access_token_expires_at"), refreshTokenExpiresAt: ts("refresh_token_expires_at"),
  scope: text("scope"), password: text("password"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().$onUpdate(() => new Date()),
}, (t) => [index("account_user_id_idx").on(t.userId)]);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);
export const rateLimit = pgTable("rate_limit", {      // Better Auth rateLimit.storage = "database"
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const jwks = pgTable("jwks", {                 // jwt() plugin
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at"),
});
```

`src/db/schema/auth-oauth.ts` is **generated verbatim** by `npx auth@latest generate` for the `@better-auth/mcp` (OAuth 2.1 provider) plugin. It contains `oauthClient`, `oauthResource`, `oauthClientResource`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent` and `oauthClientAssertion` (the last comes from cimd). **Foundation status: these are real tables, included in `0001_init.sql`** (the plugin queries `oauth_resource` while initializing, so the tables must exist whenever the plugin is loaded; there is no empty fallback). The CLI also adds `alg`/`crv` columns to `jwks`. Do not hand-edit it except to fix snake_case names and import paths. If the plugin cannot be loaded, the file is created as an empty module with a comment, and §12 falls back to anonymous-only MCP.

**Single schema exception.** If the foundation ships that empty fallback, the MCP package (and only it) may later add the generated tables to `src/db/schema/auth-oauth.ts` plus a new `drizzle/0002_oauth.sql` migration (with its snapshot). No other package touches the schema or migrations during the parallel phase.

```ts
// src/db/schema/app.ts
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
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
  publishedAt: ts("published_at"),
  removedAt: ts("removed_at"),
}, (t) => [
  index("prompts_search_idx").using("gin", t.search),
  index("prompts_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
  index("prompts_top_idx").on(t.bayesScore.desc(), t.copyCount.desc()).where(sql`${t.status} = 'published'`),
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
```

`src/db/schema/index.ts` re-exports `auth`, `auth-oauth` and `app`. `src/db/index.ts` is the pg Pool + `drizzle({ client: pool, schema })` with `attachDatabasePool` when `process.env.VERCEL` is set. The Pool is cached on `globalThis` (see the stack research). It also exports `type Db` and `type Tx`.

**Forks** are modeled as `prompts.forked_from_id` + `forked_from_version` instead of a separate table. Creating a fork increments the parent's `fork_count`.

**Counters invariant:**
- `rating_*`, `save_count`, `comment_count` and `open_report_count` are recomputed from source rows with an `UPDATE ... SET (...) = (SELECT ...)` in the same transaction as the write.
- Usage counters (`copy_count` etc.) are incremented only when the dedupe insert actually inserted a row (`ON CONFLICT DO NOTHING RETURNING id`).
- `categories.prompt_count` and `tags.prompt_count` are recomputed whenever a prompt's status, category or tags change.

## 4. Ranking

- **Rating weight** (stored per rating): `1.0` if the rater has `trust_level >= 1` or an account age of at least 7 days, else `0.5`. Authors cannot rate their own prompts.
- **Top (Bayesian):** `bayes = (C*m + Σ w·stars) / (C + Σ w)`, with `C = 8`. `m` is the global weighted mean over published prompts' ratings, stored in `app_settings['ranking.globalMean']`, defaulting to `4.0` while there are fewer than 50 ratings. It is updated on every rating write using the current `m`, and fully recomputed by the job. The UI shows the raw average `rating_sum/rating_count` and the count. Sort order: `bayes_score desc, is_featured desc, copy_count desc, published_at desc`.
- **Trending:** the score is computed over the last 7 days with half-life `H = 72h`:
  `trending = Σ_e w(e) · 0.5^(age_hours(e)/72)`. Weights: copy 1, render 1, open 2, worked 2, save 3, rating ≥ 4 3, visible comment 2.
  - Events come from `usage_events` (already deduped per actor/day), plus `saves.created_at`, `ratings.updated_at` and `comments.created_at` within the window.
  - A prompt with fewer than 3 distinct actors in the window scores 0. **Distinct actor** is defined in SQL as: `coalesce(user_id::text, actor_hash)` for `usage_events` rows, and `user_id::text` for saves, ratings and comments. The four sources are `UNION`ed and `count(DISTINCT actor)` is taken per prompt. (SQL cannot reproduce the salted JS hash, so never try to hash user ids in SQL; signed-in usage events already store `user_id`.)
  - When fewer than 12 prompts have `trending_score > 0`, the Trending list is padded with Top results (no duplicates).
- **New:** `published_at desc`.
- **Recompute** (`recomputeRankings`) is a single SQL CTE that updates `trending_score` for all published prompts, recomputes `m` and every `bayes_score`, and writes `ranking.computedAt`. It runs:
  - from `/api/cron/recompute`. `vercel.json` cron is daily, because Hobby allows only daily crons.
  - opportunistically: `maybeRecomputeRankings()` is called via `after()` from `/` and `/prompts` renders when `computedAt` is more than 10 minutes old, guarded by `pg_try_advisory_xact_lock(4242)`.
  - The cron also deletes `usage_events` older than 90 days and `app_rate_limits` rows older than 2 days.
  - The cron route runs `recomputeRankings()`, `runMaintenance()` and `recomputeActiveTrustLevels()` (the last in its own try/catch) and returns `{ prompts, globalMean, eventsDeleted, limitsDeleted, trustUpdated: number | null }`.
- **"Worked for N%"** is shown when `worked + not_worked >= 5`, using the Wilson lower bound (z = 1.96) and labelled "N% said it worked".

## 5. Search

`listPrompts(input)` serves browse, search, categories, tags, the MCP server and the home page.

- **Filters** (ANDed): `status='published'`, `category` (slug), `tag` (slug, resolved through `alias_of_id`), `model` (an `EXISTS` on `prompt_models`; "any-model" prompts with no rows are also included), `useCase`, `authorId`.
- **With `q`** (trimmed to 1-200 chars):
  ```sql
  WITH q AS (SELECT websearch_to_tsquery('english', $q) AS tsq)
  SELECT ..., ts_rank_cd(p.search, q.tsq, 32) + 0.3*similarity(p.title, $q) + 0.02*p.bayes_score AS rank
  FROM prompts p, q
  WHERE p.status='published' AND (p.search @@ q.tsq OR p.title % $q OR p.title ILIKE '%'||$qEscaped||'%')
  ORDER BY rank DESC, p.bayes_score DESC
  ```
  The default sort is `relevance` when `q` is present, otherwise `top`. An explicit sort overrides relevance but keeps the match predicate. LIKE wildcards are escaped. An empty tsquery (stopwords only) falls back to the trigram/ILIKE branch.
- **Pagination:** `pageSize` 24 (MCP max 10), `page` 1..50, plus `count(*) over()` for the total.
- **Tag autocomplete:** `slug % $q OR slug LIKE $q||'%'`, ordered by `prompt_count desc`, limit 8.
- **Duplicate detection** (`findSimilarPrompts`):
  - Candidates are the top 30 published prompts by `ts_rank_cd(search, plainto_tsquery(title + first 300 chars of body))`.
  - Score each with `greatest(similarity(title,$title), similarity(left(body,2000), left($body,2000)))`.
  - Above 0.85 the item is flagged `duplicate` and routed to review with `duplicate_of_id`.

## 6. Template variables

Users write `{{key}}` placeholders. Structured metadata lives in `prompts.variables` (`VariableDef[]`). Inline shorthand is accepted at submit time and normalized away.

```ts
// src/lib/types.ts
export interface VariableDef {
  key: string;                // ^[a-zA-Z_][a-zA-Z0-9_-]{0,39}$
  label: string;              // 1-60 chars; default = labelFromKey(key) ("target_audience" -> "Target audience")
  type: "text" | "long" | "select" | "number";
  options?: string[];         // select only; 2-20 options, each 1-60 chars
  default?: string;           // <= 500 chars
  required: boolean;          // default true unless a default is given
  help?: string;              // <= 200 chars
}
```

**Grammar.** A token is `{{ key (":" type)? ("|" default)? }}` with whitespace allowed inside the braces.
- Regex: `/(?<!\\)\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]{0,39})\s*(?::\s*(text|long|number|select\(([^)]*)\)))?\s*(?:\|([^}]*))?\}\}/g`
- `select(a, b, c)` gives comma-separated options, trimmed.
- `\{{` is an escape that renders a literal `{{`.
- Anything that looks like `{{...}}` but does not match the grammar is left as literal text and reported as a `TemplateError` (kind `"malformed"`) during submit validation. It is not an error at render time.
- The same key appearing several times is one field; the first occurrence's type/default wins, and later conflicting specs give a warning.
- Limit: 20 distinct keys.

**`normalizeTemplate(body, declared)`** rewrites every token to the canonical `{{key}}` and merges each inline spec into a `VariableDef`. When both exist, the declared def wins over the inline spec.
- Errors: a declared key not used in the body, a body key without a resulting def (impossible after merge), a `select` without options, or more than 20 keys.
- Stored bodies are always canonical.

**`renderTemplate(body, defs, values, {unfilled})`:**
- Replaces each `{{key}}` with `values[key]` when it is non-empty after trimming, else `def.default`.
- If neither exists, the result depends on `unfilled`: `"label"` gives `[Label]` (the default), `"keep"` gives `{{key}}`, `"empty"` gives `""`.
- `missing` lists the required keys with no value and no default.
- `segments` is `{kind:"text"|"var", text, key?, filled}[]`, used for the highlighted preview.
- No recursion: inserted values are never re-parsed.
- Escaped `\{{` renders as `{{`.

**Client UX** (browse pkg):
- The form is generated from `variables`: `long` gives a textarea, `select` a select, `number` a numeric input.
- A live preview shows filled values highlighted and unfilled values as `[Label]` chips.
- Copy is always enabled.
- Values are saved per prompt in `localStorage` (`lp:vars:<shortId>`, wrapped in try/catch) and never sent to the server. The one exception is the MCP `render_prompt` tool, which the model calls itself; it does not log values.

**Deep links** (`src/lib/models.ts`):

| model | mode | URL |
|---|---|---|
| chatgpt | prefill | `https://chatgpt.com/?q={enc}` |
| claude | prefill (unverified when logged in, shows a hint "if it opens empty, paste") | `https://claude.ai/new?q={enc}` |
| perplexity | autosend (warn "sends immediately") | `https://www.perplexity.ai/search?q={enc}` |
| grok | confirm | `https://grok.com/?q={enc}` |
| gemini | copy_only | `https://gemini.google.com/app` |
| copilot | copy_only | `https://copilot.microsoft.com/` |
| mistral | copy_only | `https://chat.mistral.ai/chat` |
| deepseek | copy_only | `https://chat.deepseek.com/` |

- `buildOpenLink(model, text)` uses `encodeURIComponent`. If the full URL is longer than 1900 chars, or the mode is `copy_only`, it returns the base URL with `prefilled:false`.
- The UI **always copies to the clipboard first**, then opens the link in a new tab (`noopener`), and shows a toast saying "Copied, paste with Cmd/Ctrl+V" when `prefilled` is false.
- Image and video models (midjourney, stable_diffusion, flux, sora, veo, llama) have no "Open" button; they get Copy only.
- The "Open in" button list is `OPEN_TARGETS = ["chatgpt","claude","gemini","perplexity","grok","copilot","mistral","deepseek"]`. Models a prompt declares are sorted first.

## 7. Shared types and server module contracts

Every file under `src/server/**` (except the pure `ranking/score.ts`) and `src/auth/viewer.ts` starts with `import "server-only"`.

**Import-graph rule (CLI safety).** `server-only` throws when imported outside Next's `react-server` condition, so it breaks `tsx` scripts, `drizzle-kit` and `npx auth@latest generate`. Therefore nothing in `src/db/**`, `src/auth/{server,email,mcp-plugins}.ts`, `scripts/**` or `src/lib/**` may import `server-only` directly or transitively, and none of them may import from `src/server/**`. In particular, `ensureProfile` lives in `src/db/profiles.ts` (no `server-only`), and `src/server/users.ts` re-exports it. Likewise `src/lib/env.ts` must not throw at import time (see §17).

- Reads take plain arguments. **Exception: admin reads** (`src/server/moderation/queue.ts`) take `admin: Viewer` first and assert `admin.role === "admin"` (throw FORBIDDEN), so a page that forgets its own check still cannot leak data.
- Writes take `actor: Viewer` as the first argument, so UI actions, route handlers and MCP all call the same functions.
- Inputs are validated with the zod schemas in `src/lib/validation.ts`; the server re-validates even if the caller already did.
- Errors are thrown as `AppError`.
- Dates in returned DTOs are ISO strings, so DTOs are serializable to client components and MCP.

```ts
// src/lib/types.ts (in addition to VariableDef)
import type { AI_MODELS, USE_CASES, PROMPT_STATUSES, SORT_KEYS, REPORT_TARGETS, REPORT_REASONS, REPORT_STATUSES,
  COMMENT_STATUSES, USAGE_EVENT_TYPES, EVENT_SOURCES } from "./constants";
export type AiModel = (typeof AI_MODELS)[number];          // likewise UseCase, PromptStatus, SortKey, ReportTarget,
export type TrustLevel = 0 | 1 | 2 | 3;                      // ReportReason, ReportStatus, CommentStatus, UsageEventType, EventSource
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
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };
export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "RATE_LIMITED" | "CONFLICT" | "BANNED" | "INTERNAL";
```

```ts
// src/lib/validation.ts (zod v4) — exported schemas + inferred types
export const variableDefSchema; export const promptInputSchema;  // {title 8-100, description 20-300, body 40-8000,
  // variables VariableDef[] <=20, exampleOutput <=6000 opt, notes <=2000 opt, categorySlug, useCase, tags string[] 1-5 (each normalizes to 2-32),
  // models AiModel[] 0-6, license, forkedFromShortId? }
export const promptUpdateInputSchema;  // promptInputSchema.omit({forkedFromShortId}).extend({ changeNote: max 200 opt })
export const listPromptsInputSchema;   // {q?,category?,tag?,model?,useCase?,sort?,page=1,pageSize=24 (max 48),authorId?}
export const commentInputSchema;       // {promptId uuid, parentId uuid?, body 1-2000 trimmed}
export const ratingInputSchema;        // {promptId uuid, stars int 1-5}
export const reportInputSchema;        // {targetType, targetId, reason, details <=1000 opt}
export const profileInputSchema;       // {username /^[a-z0-9][a-z0-9_-]{2,29}$/, bio <=280, website https? url <=200 opt}
export const usageEventInputSchema;    // {promptId uuid, type, model? }
export function safeNext(raw: string | null | undefined): string;  // returns raw iff it matches ^/(?![/\\]) and is <= 512 chars, else "/"
export type PromptInput = z.infer<typeof promptInputSchema>; // ...etc for each
// Exception: `ListPromptsInput = z.input<typeof listPromptsInputSchema>` so callers may omit page/pageSize (defaults are applied by the schema).
// src/lib/errors.ts
export class AppError extends Error { constructor(public code: ErrorCode, message: string, public fieldErrors?: Record<string, string[]>) }
export function toActionResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>>;
  // catch (e) { unstable_rethrow(e) /* from next/navigation: rethrows redirect()/notFound()/forbidden() errors */;
  //   AppError -> {ok:false, code, message, fieldErrors}; ZodError -> VALIDATION with fieldErrors from e.issues;
  //   anything else -> console.error + {ok:false, code:"INTERNAL", message:"Something went wrong"} }
export function notImplemented(name: string): never;
// src/lib/slug.ts
export function slugify(input: string, max?: number): string;
export function newShortId(): string;                     // 7 chars [0-9a-z]
export function buildPromptSlug(title: string, shortId: string): string;
export function parseShortIdFromSlug(slug: string): string | null;
export function normalizeTag(raw: string): string | null;  // lowercase, [a-z0-9-], collapse dashes, 2-32
export function generateUsername(seed: string): string;    // slugified + 4 random chars
// src/lib/template/index.ts
export interface TemplateError { kind: "malformed" | "unused_declared" | "select_without_options" | "too_many" | "conflict"; key?: string; message: string }
export interface ParsedVariable { key: string; type?: VariableDef["type"]; options?: string[]; default?: string; occurrences: number }
export interface RenderSegment { kind: "text" | "var"; text: string; key?: string; filled?: boolean }
export function parseTemplate(body: string): { variables: ParsedVariable[]; errors: TemplateError[] };
export function normalizeTemplate(body: string, declared?: VariableDef[]): { body: string; variables: VariableDef[]; errors: TemplateError[] };
export function renderTemplate(body: string, defs: VariableDef[], values: Record<string, string>,
  opts?: { unfilled?: "label" | "keep" | "empty" }): { text: string; missing: string[]; segments: RenderSegment[] };
export function labelFromKey(key: string): string;
// src/lib/models.ts
export interface ModelTarget { id: AiModel; name: string; vendor: string; baseUrl: string | null;
  mode: "prefill" | "autosend" | "confirm" | "copy_only" | "none"; buildUrl?: (encoded: string) => string; note?: string }
export const MODEL_TARGETS: Record<AiModel, ModelTarget>; export const OPEN_TARGETS: AiModel[];
export const MAX_DEEP_LINK_LENGTH = 1900;
export function buildOpenLink(model: AiModel, text: string): { url: string; prefilled: boolean; warning?: string } | null;
// src/lib/env.ts / base-url.ts
export const env: ServerEnv;  // LAZY: a Proxy that zod-parses process.env on first property access (memoized); never throws at import. See §17
export function getBaseUrl(): string;     // no trailing slash
export function absoluteUrl(path: string): string;
```

```ts
// src/auth/server.ts  -> export const auth = betterAuth({...}); export type Session = typeof auth.$Infer.Session;
// src/auth/client.ts  -> export const authClient = createAuthClient({ plugins: [magicLinkClient(), adminClient()] });
// src/auth/viewer.ts
export const getViewer: () => Promise<Viewer | null>;               // React cache(); auth.api.getSession, then ONE DB query joining
                                                                     // user + profiles; role and banned come from that DB row, not the cookie cache
// --- for PAGES / layouts (navigation side effects are fine here) ---
export async function requireViewer(next?: string): Promise<Viewer>; // redirect(`/sign-in?next=...`) if anon; AppError BANNED if banned
export async function requireAdmin(): Promise<Viewer>;              // notFound() unless role === "admin"
// --- for SERVER ACTIONS and route handlers (never navigate; safe inside toActionResult) ---
export async function requireViewerForAction(): Promise<Viewer>;    // AppError UNAUTHENTICATED if anon; BANNED if banned
export async function requireAdminForAction(): Promise<Viewer>;     // UNAUTHENTICATED / FORBIDDEN unless role === "admin"
export async function getViewerById(userId: string): Promise<Viewer | null>; // used by MCP after token verification
```

```ts
// src/server/prompts/mappers.ts  (foundation, real; data-read owns afterwards; exports frozen during the parallel phase)
export const promptCardColumns;  // drizzle select shape shared by every PromptCard-returning query (incl. author + category join)
export function toPromptCard(row: PromptCardRow): PromptCard;
export function toPromptDetail(row: PromptDetailRow, extras: { tags: string[]; models: AiModel[]; testedOn: ...; forkedFrom: ... }, opts: { includeNonPublic: boolean }): PromptDetail;
// src/server/prompts/queries.ts
// React cache() keys arguments by identity, so options objects never dedupe. Cache an inner function with PRIMITIVE args
// and expose the documented signature as a thin wrapper:
//   const getPromptByShortIdCached = cache((shortId: string, includeNonPublic: boolean) => ...);
//   export const getPromptByShortId = (shortId, opts) => getPromptByShortIdCached(shortId, opts?.includeNonPublic ?? false);
// The same rule applies to any cached function that takes an object.
export const getPromptByShortId: (shortId: string, opts?: { includeNonPublic?: boolean }) => Promise<PromptDetail | null>; // cached as above
export async function getPromptById(id: string, opts?: { includeNonPublic?: boolean }): Promise<PromptDetail | null>;
export async function listPrompts(input: ListPromptsInput): Promise<Paginated<PromptCard>>;
export async function getHomeSections(): Promise<{ featured: PromptCard[]; trending: PromptCard[]; top: PromptCard[]; latest: PromptCard[] }>;
export async function getRelatedPrompts(promptId: string, limit?: number): Promise<PromptCard[]>;
export async function listPromptVersions(promptId: string): Promise<PromptVersionSummary[]>;
export async function getPromptVersion(promptId: string, version: number): Promise<PromptVersionDetail | null>;
export async function getViewerPromptState(promptId: string, viewer: Viewer | null): Promise<ViewerPromptState>;
export async function listPromptsByAuthor(authorId: string, opts?: { page?: number; includeNonPublic?: boolean }): Promise<Paginated<PromptCard & { status: PromptStatus; moderationNote: string | null }>>;
export async function listSitemapEntries(): Promise<{ slug: string; updatedAt: string }[]>;
export async function findSimilarPrompts(input: { title: string; body: string }, opts?: { excludeId?: string; limit?: number }): Promise<{ id: string; slug: string; title: string; similarity: number }[]>; // foundation implements for real (one query, §5)
// src/server/prompts/mutations.ts
export async function createPrompt(actor: Viewer, input: PromptInput): Promise<{ id: string; shortId: string; slug: string; status: PromptStatus }>;
export async function updatePrompt(actor: Viewer, promptId: string, input: PromptUpdateInput): Promise<{ slug: string; version: number; status: PromptStatus }>;
export async function deletePrompt(actor: Viewer, promptId: string): Promise<void>;  // author/admin -> status 'removed'
// src/server/taxonomy.ts
export const listCategories: () => Promise<CategoryWithCount[]>;   // React cache()
export async function getCategoryBySlug(slug: string): Promise<CategoryWithCount | null>;
export async function getTagBySlug(slug: string): Promise<TagSummary | null>;
export async function listPopularTags(limit?: number): Promise<TagSummary[]>;
export async function suggestTags(prefix: string, limit?: number): Promise<TagSummary[]>;
// src/server/ratings.ts
export async function ratePrompt(actor: Viewer, promptId: string, stars: number): Promise<RatingSummary>;
export async function removeRating(actor: Viewer, promptId: string): Promise<RatingSummary>;
// src/server/comments.ts
export async function listComments(promptId: string, viewer: Viewer | null): Promise<CommentNode[]>; // visible + own pending; admins see all
export async function createComment(actor: Viewer, input: CommentInput): Promise<CommentNode>;
export async function updateComment(actor: Viewer, commentId: string, body: string): Promise<CommentNode>; // author, within 24h
export async function deleteComment(actor: Viewer, commentId: string): Promise<void>;  // author/admin -> 'removed', body kept for audit
// src/server/saves.ts
export async function setSaved(actor: Viewer, promptId: string, saved: boolean): Promise<{ saved: boolean; saveCount: number }>;
export async function listSavedPrompts(userId: string, page?: number): Promise<Paginated<PromptCard>>;
// src/server/usage.ts
export interface UsageEventRecord { promptId: string; type: UsageEventType; model?: AiModel | null; source: EventSource;
  userId?: string | null; ip?: string | null; userAgent?: string | null }
export async function recordUsageEvent(input: UsageEventRecord): Promise<{ counted: boolean }>;
export function hashActor(input: { userId?: string | null; ip?: string | null; userAgent?: string | null }): string;
// src/server/reports.ts
export async function createReport(actor: Viewer, input: ReportInput): Promise<{ id: string; autoHidden: boolean }>;
// src/server/users.ts
export { ensureProfile } from "@/db/profiles";  // ensureProfile(u: {id,name,email}): Promise<void>; idempotent; foundation-owned, no server-only
export async function getProfileByUsername(username: string): Promise<ProfilePage | null>;
export async function updateProfile(actor: Viewer, input: ProfileInput): Promise<ProfilePage>;      // CONFLICT on taken username
export async function recomputeTrustLevel(userId: string): Promise<TrustLevel>;
export async function recomputeActiveTrustLevels(sinceDays?: number): Promise<number>;  // users with activity in the last N (default 2) days; returns count changed
// src/server/moderation/screening.ts
export interface ScreenInput { kind: "prompt" | "comment"; title?: string; text: string;
  author: { trustLevel: TrustLevel; accountAgeDays: number }; excludePromptId?: string }
export function runHeuristics(input: ScreenInput): ScreeningResult;            // pure, sync
export async function screenContent(input: ScreenInput): Promise<ScreeningResult>; // heuristics + duplicate (prompts) + OpenAI moderation if key
// src/server/moderation/queue.ts   (every function asserts admin.role === "admin" first, else AppError FORBIDDEN)
export async function getModerationQueue(admin: Viewer, input: { kind: "prompt" | "comment"; page?: number }): Promise<Paginated<ModerationQueueItem>>;
export async function listReports(admin: Viewer, input: { status?: ReportStatus; page?: number }): Promise<Paginated<ReportItem>>;
export async function getAdminStats(admin: Viewer): Promise<AdminStats>;
export async function listModerationLog(admin: Viewer, page?: number): Promise<Paginated<ModerationLogItem>>;
export async function listAdminUsers(admin: Viewer, input: { q?: string; page?: number }): Promise<Paginated<AdminUserRow>>;
export async function listAdminPrompts(admin: Viewer, input: { q?: string; status?: PromptStatus; page?: number }): Promise<Paginated<PromptCard & { status: PromptStatus; moderationFlags: string[] }>>;
// src/server/moderation/actions.ts   (all assert admin.role === "admin", write moderation_actions, keep counters right)
export async function moderatePrompt(admin: Viewer, promptId: string, action: "approve" | "reject" | "hide" | "restore" | "remove" | "feature" | "unfeature", reason?: string): Promise<void>;
export async function moderateComment(admin: Viewer, commentId: string, action: "approve" | "hide" | "restore" | "remove", reason?: string): Promise<void>;
export async function resolveReport(admin: Viewer, reportId: string, resolution: "actioned" | "dismissed", note?: string): Promise<void>;
export async function setUserBan(admin: Viewer, userId: string, input: { banned: boolean; reason?: string }): Promise<void>; // updates user.banned*, deletes sessions; FORBIDDEN if userId === admin.id (enforced here, not only in the UI)
export async function setTrustLevel(admin: Viewer, userId: string, level: TrustLevel): Promise<void>;
// src/server/ranking/score.ts (pure)
export const RANKING = { C: 8, DEFAULT_MEAN: 4.0, MIN_RATINGS_FOR_MEAN: 50, HALF_LIFE_HOURS: 72, WINDOW_DAYS: 7, MIN_ACTORS: 3,
  WEIGHTS: { copy: 1, render: 1, open: 2, worked: 2, save: 3, rating: 3, comment: 2 } } as const;
export function bayesianScore(weightedSum: number, weightSum: number, globalMean: number, c?: number): number;
export function ratingWeight(rater: { trustLevel: TrustLevel; accountAgeDays: number }): number;
export function decayWeight(ageHours: number, halfLifeHours?: number): number;
export function wilsonLowerBound(positive: number, total: number, z?: number): number;
// src/server/ranking/recompute.ts
export async function recomputeRankings(): Promise<{ prompts: number; globalMean: number }>;
export async function maybeRecomputeRankings(): Promise<void>;
export async function runMaintenance(): Promise<{ eventsDeleted: number; limitsDeleted: number }>;  // deletions only; trust recompute is recomputeActiveTrustLevels (users.ts), called by the cron route
// src/server/rate-limit.ts
export type LimitedAction = "prompt_create" | "prompt_update" | "comment" | "rating" | "save" | "report" | "event" | "mcp" | "tag_suggest";
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; remaining: number; retryAfterSeconds: number }>;
export async function enforceRateLimit(action: LimitedAction, subject: { userId?: string; ip?: string; trustLevel?: TrustLevel }): Promise<void>; // throws RATE_LIMITED
export function clientIp(headers: Headers): string | null;  // x-real-ip, then first x-forwarded-for
// enforceRateLimit subject: `userId` when signed in, else a salted hash of `ip` (raw IPs are never stored). For "mcp", `userId` carries the
// rate-limit SUBJECT (verified token user id, else params._meta["openai/subject"]); the 600/min per-IP-hash ceiling applies whenever `ip` is given.
// rate-limit.ts is implemented FOR REAL by the foundation (it is small and fully specified in §11 and the data-write
// instructions) because both data packages, /api/events, /api/tags/suggest and /mcp depend on it.
```

**Status logic in `createPrompt`:**
1. Run the rate limit.
2. Validate, then `normalizeTemplate`. Template errors become a VALIDATION error with `fieldErrors.body`.
3. Resolve or create tags.
4. `screenContent`.
5. Choose the status:
   - `reject`: VALIDATION error with the reasons. Nothing is stored.
   - `review`, or `trustLevel === 0`: `pending`.
   - Otherwise: `published` with `publishedAt=now()`.
6. In one transaction: insert the prompt, version 1, tags and models, update counts, and increment the parent's `fork_count` for a fork.

**`updatePrompt`:**
- A material change (title/body/variables/description) creates version N+1.
- Changing the title rewrites the slug (the old slug redirects through shortId).
- A published prompt edited by a trust-0 author with a `review` verdict goes back to `pending`. Otherwise its status is unchanged.
- Admins can edit any prompt.

## 8. Server actions vs route handlers

- **Server actions** (`src/actions/*.ts`, `"use server"`) handle all site mutations from forms and buttons.
  - Pattern: `export async function rateAction(input: RatingInput & { slug: string }): Promise<ActionResult<RatingSummary>> { const r = await toActionResult(async () => { const v = await requireViewerForAction(); return ratePrompt(v, input.promptId, input.stars); }); if (r.ok) revalidatePath(\`/p/${input.slug}\`); return r; }`.
  - **Actions never call `requireViewer()`/`requireAdmin()`** (those navigate). They call `requireViewerForAction()` / `requireAdminForAction()`, which throw `AppError` (UNAUTHENTICATED / FORBIDDEN / BANNED) and come back as an `ActionResult`.
  - `toActionResult` calls `unstable_rethrow(e)` first, so a `redirect()`/`notFound()` that does happen inside it still navigates instead of becoming INTERNAL. Even so, an action's own `redirect()` is always called **after** `toActionResult` returns, outside any try/catch: `const r = await toActionResult(...); if (!r.ok) return r; redirect(...)`.
  - **Client handling of UNAUTHENTICATED:** every client component that calls an action does `if (!r.ok && r.code === "UNAUTHENTICATED") router.push(\`/sign-in?next=${encodeURIComponent(pathname + hash)}\`)`. Anonymous users normally never reach that point, because the UI renders sign-in links for them (the `signedIn` prop), so it is only the session-expired path.
  - Form actions used with `useActionState` take `(prev, formData)` and return `ActionResult` with `fieldErrors` for inline display.
  - Files: `prompts.ts` (create/update/delete), `ratings.ts`, `comments.ts`, `saves.ts`, `reports.ts`, `profile.ts`, and `admin.ts` (owned by admin).
- **Route handlers** are used for non-form or non-browser callers: Better Auth, `/api/events` (sendBeacon, keepalive), `/api/tags/suggest`, `/api/cron/recompute`, `/api/health`, `/mcp`, `/api/well-known/*`, the feed, sitemap, robots, OG.
  - Handlers that mutate check `Origin` (events) or a bearer secret (cron), and are rate-limited.

## 9. Rendering, caching and revalidation

Decision for v1: **`cacheComponents` stays off, and every page is dynamic SSR.**
- The root layout reads the session (`getViewer()`), so pages render per request. With about 200 to 10k prompts and indexed queries, this costs less than 30 ms of DB time per page on Neon pooled TCP.
- This avoids the Cache Components failure modes listed in the research: runtime-only errors, Suspense requirements, and `cookies()` inside cached scopes. Builder agents would otherwise trip on them.
- Per-request dedupe uses React `cache()` on `getViewer`, `getPromptByShortId` and `listCategories`. `generateMetadata` and the page share the same call. `cache()` compares arguments by identity, so a cached function never takes an options object directly: cache an inner function with primitive arguments and wrap it (§7, `queries.ts`).
- Server actions call `revalidatePath()` for the affected paths (`/p/[slug]`, `/`, `/prompts`, `/me/*`, `/admin/*`) so the client router cache refreshes.
- `sitemap.ts`, `robots.ts`, `feed.xml` and `opengraph-image` use `export const revalidate = 3600` (allowed because Cache Components is off).
- Static assets come from the Vercel CDN.
- The upgrade path is Cache Components with `'use cache'` wrappers on the public read functions and tags `prompt:<id>`, `prompts:list`, `categories`. Because all reads go through `src/server`, this is a localized change.

## 10. Auth and roles

`src/auth/server.ts`:
```ts
betterAuth({
  baseURL: getBaseUrl(), secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [getBaseUrl(), vercelUrlOrigins...],                 // VERCEL_URL + VERCEL_BRANCH_URL on preview
  socialProviders: { ...(google env ? { google } : {}), ...(github env ? { github } : {}) },
  emailAndPassword: { enabled: false },
  session: { cookieCache: { enabled: true, maxAge: 60 } },                // short, so bans and role changes apply within a minute
  rateLimit: { enabled: env.NODE_ENV === "production", storage: "database",
    customRules: { "/sign-in/magic-link": { window: 60, max: 3 } } },
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] } },
  databaseHooks: { user: { create: { after: async (u) => { await ensureProfile(u); if (ADMIN_EMAILS.has(u.email)) set role admin } } } },
                  // ensureProfile is imported from src/db/profiles.ts (no server-only; see §7 import-graph rule)
  plugins: [ admin({ defaultRole: "user", adminRoles: ["admin"] }),
             magicLink({ expiresIn: 600, sendMagicLink }),   // Resend if RESEND_API_KEY else console + MAGIC_LINK_DEV_SINK file
             ...mcpAuthPlugins(),                             // src/auth/mcp-plugins.ts: [jwt(), mcp({...}), cimd({...})] or []
             nextCookies() ],                                 // last
})
```

- **Roles:** `user` and `admin` (Better Auth admin plugin). Bootstrap: emails listed in `ADMIN_EMAILS` are promoted on create and on sign-in (an idempotent check in a `session.create.after` hook).
- **Trust levels** (`profiles.trust_level`):
  - 0: new.
  - 1: at least 2 published prompts, or account at least 7 days old with at least 3 visible comments and no upheld reports. Recomputed after approvals and nightly.
  - 2: set by an admin.
  - 3: staff or system.
- **Protected pages:** `src/proxy.ts` does an optimistic `getSessionCookie` redirect for `/submit`, `/me/*`, `/settings`, `/p/*/edit`, `/admin/*` and `/oauth/consent`. Every page re-checks with `requireViewer`/`requireAdmin`; every server action re-checks with `requireViewerForAction`/`requireAdminForAction`.
- **Admin pages:** Next renders a layout and its page in parallel and does not re-run layouts on client navigation, so a layout check alone does not stop a page's queries. `await requireAdmin()` is therefore the **first statement of every `src/app/admin/**/page.tsx`**, in addition to the admin layout, every admin action, and the `admin: Viewer` assertion inside every `moderation/queue.ts` read.
- **Bans:** `getViewer()` reads `user.banned` and `user.role` from the database on every request (one join with `profiles`), so writes are blocked immediately after a ban. `setUserBan` also deletes the user's sessions, and the 60 s `cookieCache` bounds anything else that reads the session cookie directly.
- **Banned users:** Better Auth blocks sign-in for them. `requireViewer` throws BANNED, and their content stays as it is unless an admin removes it.
- **`next` parameter:** must match `^/(?![/\\])` (no protocol-relative `//` and no `/\` backslash variants), otherwise `/` is used. One helper, `safeNext(raw)` in `src/lib/validation.ts`, is used everywhere.

## 11. Moderation flow

1. **Screening** (`runHeuristics`). Flags and verdicts:
   - Each URL gives `link`; more than 2 URLs gives `too_many_links`.
   - A URL-shortener host gives `shortener` → **reject**. Hosts: bit.ly, tinyurl.com, t.co, goo.gl, ow.ly, is.gd, buff.ly, cutt.ly, rebrand.ly, shorturl.at, rb.gy.
   - Affiliate patterns give `affiliate` → review: `amzn.to`, `?tag=`, `ref=`, `aff`, `utm_` with a non-content host.
   - Jailbreak patterns give `jailbreak` → review: "ignore (all )?(previous|prior) instructions", `\bDAN\b`, "developer mode", "jailbreak", "no (ethical|content) (guidelines|restrictions)", "do anything now".
   - SEO-spam patterns give `seo_spam` → review: "100% unique", "plagiarism[- ]free", "undetectable", "bypass (ai|gpt) detect", "humanize .* detector".
   - An email address or phone number gives `contact_info` → review.
   - An uppercase ratio above 0.6 on a title longer than 12 chars gives `shouting`.
   - Any character or word repeated more than 10 times gives `repetition`.
   - Trust 0 plus any `link` → review.
   - `screenContent` adds `duplicate` (prompts) and `openai_flagged`. The latter uses OpenAI `omni-moderation-latest` when `OPENAI_API_KEY` is set, with a 3 s timeout. Its categories `sexual/minors` → reject; any other flagged category → review.
2. **Status:** trust 0 prompts are always `pending`. Comments go `pending` only on a review verdict or when a trust-0 author includes a link. Rejected content is never stored, and the user sees the reasons.
3. **Rate limits** (fixed window via `app_rate_limits`; `limit/window` at trust 0 → trust ≥ 1):
   - prompt_create: 3/day → 15/day
   - prompt_update: 30/day
   - comment: 20/day → 100/day, plus 1 per 15 s burst
   - rating: 200/day
   - save: 300/day
   - report: 20/day
   - event: 300/hour per actor hash
   - mcp: 120/min per **subject**, plus a 600/min ceiling per IP hash. ChatGPT and Claude share egress IPs, so a per-IP limit alone would throttle every user together. The subject is the verified token's user id when a valid bearer is present, else `params._meta["openai/subject"]` from the peeked JSON-RPC body when present, else the IP hash. The subject is used for rate limiting only, never for authorization.
   - tag_suggest: 60/min per IP
4. **Reports:** one open report per reporter and target.
   - Once open reports from distinct reporters reach `REPORT_AUTOHIDE_THRESHOLD` (default 3), the prompt or comment goes to `hidden` with `auto_hidden_at`, and an `auto_hide` row is logged.
   - Reports on users only go to the queue.
5. **Admin queue** (`/admin/queue`): tabs Prompts and Comments, oldest first, showing flags, an excerpt, the author's trust and a link.
   - Actions: approve (publish + `recomputeTrustLevel`), reject (with a reason shown to the author on `/me/prompts`), hide, remove, ban the author.
   - `/admin/reports` groups reports by target. Actioning one resolves all open reports for the same target.
   - Every action writes `moderation_actions`.
6. **Published policy** (`/guidelines`):
   - No jailbreaks, NSFW, personal data, malware or harassment.
   - Content is licensed CC BY 4.0 by default, with CC0 as an option.
   - A DMCA/takedown contact is listed.
   - 3 upheld strikes lead to a ban.

## 12. ChatGPT App / Claude connector (MCP)

**Packages** (stack A, pinned exactly in foundation): `mcp-handler@^2.2.0`, `@modelcontextprotocol/server@^2.2.0`, `@modelcontextprotocol/ext-apps@^2.0.3`, `zod@^4.2`. Do not install `@modelcontextprotocol/sdk` (v1).

**Verified exports** (checked against the installed `.d.ts` files; the MCP builder does not need to re-research these, only confirm exact option names):
- `mcp-handler`: `createMcpHandler` (alias of `createMcpRouteHandler`), `withMcpAuth`, `protectedResourceHandler`, `generateProtectedResourceMetadata`, `metadataCorsOptionsRequestHandler`, `getPublicOrigin`, `getPublicUrl`.
- `@modelcontextprotocol/ext-apps/server`: `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`. Its `ToolConfig` is `{ title, description, inputSchema, outputSchema, annotations, _meta }`; there is **no top-level `securitySchemes`**. `_meta.ui.visibility` accepts `["model"]`, `["app"]` or both.
- `@better-auth/mcp@1.7.7`: `createMcpProtectedRequestHandler({ issuer, audience, jwksUrl?, requiredScopes?, challengeScopes?, jwtVerifyOptions? }, (request, accessTokenClaims) => Response)` returns `(request) => Promise<Response>` and emits the RFC 9728 `WWW-Authenticate` challenge itself; `requireMcpAuth(auth, handler, opts)` is the in-process variant. `issuer` defaults to Better Auth's resolved base URL, i.e. `<base>/api/auth`.

**Route** `src/app/mcp/route.ts`. Exports GET, POST, DELETE and OPTIONS, with `export const maxDuration = 30`. The `createMcpHandler` handler is stateless and keeps the Streamable-HTTP fallback for 2025-era clients.

Request pipeline (POST):
1. Body larger than 64 KB → 413. Parse a cloned body once (`peek`); a malformed body is passed through so the handler returns the JSON-RPC parse error.
2. Rate limit (§11): per subject (token user id, else `params._meta["openai/subject"]`, else IP hash) at 120/min, plus a per-IP ceiling of 600/min. Over the limit returns a JSON-RPC error with HTTP 429.
3. If `MCP_OAUTH_ENABLED` and the peeked body is a `tools/call` for a protected tool (`rate_prompt`, `save_prompt`), the **challenge mode** decides how a missing or invalid token is reported. `MCP_AUTH_CHALLENGE` = `auto` (default) | `http401` | `result`:
   - `http401`: the request goes through `createMcpProtectedRequestHandler({ issuer: <base>/api/auth, audience: <base>/mcp, requiredScopes: ["prompts:write"], challengeScopes: ["prompts:write"] }, ...)` from `@better-auth/mcp`, which answers HTTP **401** with `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource", scope="prompts:write", ...`. This is what Claude needs.
   - `result`: no HTTP gate. The request reaches the tool, which returns the in-result challenge (step 5). This is ChatGPT's documented path.
   - `auto`: `result` when the `User-Agent` contains `openai` or `chatgpt` (case-insensitive), else `http401`.
   - If the issuer in the proxied AS metadata differs from `<base>/api/auth`, use the metadata's value; never hard-code a different one.
4. `withMcpAuth(handler, verifyToken, { required: false, resourceUrl: <base>/mcp, resourceMetadataPath: "/.well-known/oauth-protected-resource" })`. `initialize`, `tools/list`, `resources/*` and the read tools always stay anonymous.
5. Inside the write tools, if `ctx.http?.authInfo` is missing (only reachable in `result` mode, or `auto` with a ChatGPT UA), return `isError: true` with `_meta["mcp/www_authenticate"] = ['Bearer resource_metadata="<base>/.well-known/oauth-protected-resource", error="insufficient_scope", error_description="Sign in to LazyPrompt"']`.
6. Integration tests cover both observable outcomes: `http401` → HTTP 401 + `WWW-Authenticate` containing `resource_metadata` and `scope`; `result` → HTTP 200 with `isError` and `_meta["mcp/www_authenticate"]`; `auto` picks each based on the UA.

`verifyToken` (`src/mcp/auth.ts`):
- Uses the **same verification as step 3**: the claims verifier behind `createMcpProtectedRequestHandler` (issuer `<base>/api/auth`, audience `<base>/mcp`, Better Auth's JWKS at `<base>/api/auth/jwks`). If the package does not export the verifier on its own, wrap a request through `createMcpProtectedRequestHandler` and capture `accessTokenClaims`, or fall back to `jose` `createRemoteJWKSet` with the identical issuer/audience/JWKS (module-level cache).
- Map to `AuthInfo { token, clientId, scopes, expiresAt, extra: { userId: claims.sub } }`.
- Tools resolve `getViewerById(userId)` and reject banned users.
- Never log or return the token. The MCP route never reads session cookies.

**Tools.** All tools set the three required annotations plus `idempotentHint`. Security schemes go **only** in `_meta.securitySchemes` (the ext-apps `ToolConfig` has no top-level field): read tools `[{type:"noauth"}]`, write tools `[{type:"oauth2", scopes:["prompts:write"]}]`. Tools the widget calls itself (`get_prompt`, `render_prompt`, `rate_prompt`, `save_prompt`) also set `_meta["openai/widgetAccessible"]: true` and `_meta.ui.visibility: ["model","app"]`. Tool names and descriptions lock once the app is published in ChatGPT, so write them carefully now.

| tool | input (zod) | structuredContent | widget | annotations (ro/destr/openWorld/idem) |
|---|---|---|---|---|
| `search_prompts` | `{ query?: string(1-200), category?: CategorySlug, model?: AiModel, sort?: "relevance"\|"top"\|"trending"\|"new" (default relevance if query else top), limit?: int 1-10 = 5 }` | `{ query, total, results: [{ id: shortId, title, description, category, tags, models, rating: number\|null, ratingCount, copies, variableCount, url }] }` | yes (list) | true/false/false/true |
| `get_prompt` | `{ id: string }` (shortId or full slug) | `{ prompt: { id, title, description, body, variables: VariableDef[], exampleOutput (≤1500 chars, truncated flag), notes, category, tags, models, rating, ratingCount, author, license, url } }` | yes (card) | true/false/false/true |
| `render_prompt` | `{ id: string, values: Record<string,string> (≤20 keys, each ≤4000 chars) }` | `{ id, text, missing: string[], complete: boolean, openLinks: [{ model, url, prefilled }] }` | yes (card, filled) | true/false/false/true |
| `list_categories` | `{}` | `{ categories: [{ slug, name, description, promptCount }] }` | no | true/false/false/true |
| `rate_prompt` (OAuth) | `{ id: string, stars: int 1-5 }` | `{ id, yourRating, rating, ratingCount }` | no | false/false/true (the public aggregate changes)/true |
| `save_prompt` (OAuth) | `{ id: string }` (add only; unsave on the site) | `{ id, saved: true, saveCount }` | no | false/false/false/true |

- Descriptions follow the form "Use this when the user wants to find ready-made, community-rated AI prompts by topic or task." No "prefer this app" language.
- `content` is a short narration such as "Found 5 prompts for 'cold email'".
- `_meta` (widget only) carries full fields that are not needed in the transcript.
- Results never contain timestamps, session ids or emails.
- Only `render_prompt` records a usage event (`render`, source `mcp`, actor = hashed IP). `get_prompt` and `search_prompts` record nothing.
- Errors (not found, validation) return `isError: true` with readable text.

**Widget:**
- One self-contained bundle is built from `widget/`: Vite + React 19 + `vite-plugin-singlefile` + `App` from `@modelcontextprotocol/ext-apps`, with small inline CSS that follows the host theme.
- `scripts/embed-widget.ts` writes `src/mcp/widget-html.generated.ts` (`export const WIDGET_HTML = "..."; export const WIDGET_VERSION = "<sha256-8>"`). The file is committed. CI rebuilds it and fails on a diff.
- Resource `ui://lazyprompt/prompt-widget.html?v=${WIDGET_VERSION}` uses mime `text/html;profile=mcp-app` (the `registerAppResource` default). `_meta.ui`:
  - `prefersBorder: true`
  - `csp: { connectDomains: [], resourceDomains: [] }`. The widget never fetches; all data comes through tool results or `app.callServerTool`.
  - `domain: env.MCP_WIDGET_DOMAIN` only when it is set (needed for submission later).
  - `openai/widgetDescription` is kept.
- Handlers are registered before `await app.connect()`.
- **List mode** (structuredContent has `results`): cards. Clicking one calls `callServerTool("get_prompt")` and switches to card mode in place.
- **Card mode**: title, rating, the variable form (rendered locally with the shared `src/lib/template`, imported through a Vite alias), and a live preview. Buttons:
  - "Use in chat": `app.sendMessage({role:"user", content:[{type:"text", text: filled}]})`.
  - "Copy": `navigator.clipboard`, with a select-text fallback.
  - "Open on LazyPrompt": `app.openLink`.
  - "Rate": `callServerTool("rate_prompt")` when write tools are listed, else `openLink` to `/p/slug#rate`.
- Bundle budget: 200 KB.

**OAuth** (only when `MCP_OAUTH_ENABLED=true`):
- `src/auth/mcp-plugins.ts` returns:
  - `jwt()`
  - `mcp({ loginPage: "/sign-in", consentPage: "/oauth/consent", resource: \`${base}/mcp\`, scopes: ["openid","profile","email","offline_access","prompts:read","prompts:write"], allowDynamicClientRegistration: true, allowUnauthenticatedClientRegistration: true })`. DCR is needed by ChatGPT; registration is rate-limited by the Better Auth rateLimit customRules.
  - `cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" })`
- The plugins are always included so the tables exist. The flag only controls tool registration and the HTTP gate.
- `/api/well-known/oauth-protected-resource[/mcp]` **proxies** to Better Auth (`auth.handler` on `<base>/api/auth/.well-known/oauth-protected-resource`; the mcp() plugin already serves PRM there), so `resource` always equals the token audience. Only if that endpoint is missing does the route build PRM itself with `resource=<base>/mcp`, `authorization_servers=[<base>/api/auth]`, `scopes_supported`, `bearer_methods_supported:["header"]`. When the flag is off it still answers (harmless).
- `/api/well-known/oauth-authorization-server[/api/auth]` and `/api/well-known/openid-configuration[/api/auth]` proxy to Better Auth's metadata.
- The AS metadata already advertises `code_challenge_methods_supported:["S256"]`. `registration_endpoint` only appears when DCR is enabled (`allowDynamicClientRegistration: true`); a test asserts both. Add `client_id_metadata_document_supported` once CIMD is verified.
- Sign-in must honor the OAuth continuation. The `/sign-in` page passes the full original query to Better Auth via `callbackURL`. If the plugin requires its own continuation call, MCP owns a thin `/oauth/sign-in` wrapper page and points `loginPage` at it instead of changing `/sign-in`.
- Redirect URIs come from client registration (DCR/CIMD). Document the ChatGPT and Claude callback URLs in `/apps`.

**Fallback:** if OAuth is not clean by the end of the MCP package, ship with the flag off. Read tools return the `url`, and the widget's Rate and Save buttons deep-link to the site.

**Preview caveats** (also in `docs/mcp.md` and §20): `resource` and the token `aud` are bound to `getBaseUrl()`, which on a preview is the stable branch URL (`VERCEL_BRANCH_URL`). Add the connector with `https://<branch-url>/mcp`, never a per-deployment URL, or tokens will fail audience checks. Vercel crons do not run on previews.

## 13. Security

- **Rendering:**
  - User content is never passed through `dangerouslySetInnerHTML`.
  - Prompt body, example output and notes render as text in `whitespace-pre-wrap` blocks. There is no markdown in v1; this is the "markdown-safe" choice.
  - `<Linkify>` (`src/components/ui/linkify.tsx`, foundation) turns `https?://` URLs in comments, bios and notes into `<a rel="ugc nofollow noopener noreferrer" target="_blank">`. Only http(s) schemes are allowed.
  - Profile websites are validated as https URLs.
  - JSON-LD is serialized with `JSON.stringify(x).replace(/</g, "\\u003c")`.
- **Headers** (`next.config.ts headers()`):
  - CSP: `default-src 'self'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://lh3.googleusercontent.com https://avatars.githubusercontent.com; connect-src 'self' https://vitals.vercel-insights.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com https://github.com`. `'unsafe-eval'` is added only in dev.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
  - `/mcp` and `/api/well-known/*` get no CSP frame rules; CORS `*` is set for GET/OPTIONS on the well-known routes, and `/mcp` answers OPTIONS.
- **CSRF:**
  - Server actions rely on Next's Origin/Host check.
  - Better Auth checks `trustedOrigins`.
  - `/api/events` requires `Origin` to equal the base URL host (or be absent with `sec-fetch-site: same-origin`).
  - `/mcp` is bearer-only, so cookie CSRF does not apply.
- **Input limits** are listed in §7. Additional limits: request bodies to `/api/events` are at most 1 KB, MCP bodies at most 64 KB, and `/prompts` search `q` is at most 200 chars.
- **Secrets and PII:**
  - IPs are only hashed (`IP_HASH_SALT`).
  - No secrets in URLs.
  - Deep links carry only the user's filled prompt text, and the UI warns "Don't paste secrets".
  - MCP and server logs never include tokens, emails or variable values.
- **AuthZ:** the server layer always checks ownership or the admin role. UI hiding is only cosmetic.
- **Abuse:** the rate limits in §11, Better Auth's built-in auth limits, the magic-link 3/min rule, and the screening rules. Turnstile is deferred.

## 14. SEO

- **`generateMetadata`:**
  - Prompt pages: `title = "<title> – AI prompt | LazyPrompt"` truncated to 60 chars, and `description = description`, or the body's first 150 chars plus the use case.
  - Canonical is `absoluteUrl(/p/slug)` with query params stripped.
  - Open Graph and Twitter `summary_large_image` cards are included.
  - Non-published prompts, tag pages with fewer than 5 prompts, `/prompts?…` filter combinations other than a bare `?q` (`robots: noindex, follow`), and every page when `SEO_NOINDEX=true` (previews) are noindexed.
- **JSON-LD:**
  - Prompt pages carry `CreativeWork`: name, text (body), description, author Person (url `/u/x`), datePublished, dateModified, keywords, genre (category), inLanguage, license URL, `interactionStatistic` (UserInteraction copies), and `isBasedOn` for forks.
  - `aggregateRating` is included only when `ratingCount >= 3` (real, visible ratings).
  - Prompt pages also carry `BreadcrumbList`. Category pages carry `ItemList`. The home page carries `WebSite` with `SearchAction` (`/prompts?q={search_term_string}`).
- **`sitemap.ts`:** static pages, categories, tags with at least 5 prompts, and every published prompt with `lastModified`. Split with `generateSitemaps` past 45k URLs.
- **`robots.ts`:** disallows `/admin`, `/api`, `/me`, `/settings`, `/submit`, `/oauth`, `/mcp`. `SEO_NOINDEX` disallows everything.
- **OG images** (`next/og` ImageResponse, 1200×630): the site default, plus per-prompt title, category, rating and "LazyPrompt" wordmark. Fonts load from a bundled file in `src/lib/seo/fonts/`.
- **Other:** `/feed.xml` (RSS 2.0, the latest 50 published prompts) and `/llms.txt` (site summary plus category links). UGC links use `rel="ugc nofollow"`.

## 15. Analytics

- `@vercel/analytics` `<Analytics/>` and `@vercel/speed-insights` are mounted in the root layout (foundation).
- `trackEvent(name, props)` in `src/lib/analytics.ts` wraps `track()` and silently no-ops on failure. Custom events need Vercel Pro; they no-op harmlessly on Hobby.
- Events (no PII and no query text):
  - `prompt_copy {category, filled: boolean}`
  - `prompt_open {model, prefilled}`
  - `prompt_feedback {worked}`
  - `prompt_save`
  - `prompt_rate {stars}`
  - `comment_post`
  - `prompt_submit {status}`
  - `search {results: n, hasFilters}`
  - `sign_in_start {method}`
- First-party product metrics come from `usage_events` (copy/open/render/worked/not_worked) and the admin stats.

## 16. Seed content and format

- `content/categories.json`: `[{ "slug": "coding", "name": "Coding", "description": "...", "icon": "code", "sortOrder": 3 }]`. There are 12 categories (§ seed list below).
- `content/prompts/<category-slug>.json`. One file per category; files starting with `_` are skipped.

```json
{
  "category": "coding",
  "prompts": [{
    "key": "coding-pr-review-checklist",
    "title": "Senior engineer pull request review",
    "description": "Get a structured, prioritized code review with concrete fixes, not vague advice.",
    "body": "You are a senior {{language}} engineer reviewing a pull request.\n...\n{{diff}}",
    "variables": [
      { "key": "language", "label": "Language", "type": "select", "options": ["TypeScript", "Python", "Go"], "default": "TypeScript", "required": true },
      { "key": "diff", "label": "Diff or code", "type": "long", "required": true, "help": "Paste the diff" }
    ],
    "exampleOutput": "## Blocking\n1. ...",
    "notes": "Why it works: forces severity ordering...",
    "useCase": "critique",
    "tags": ["code-review", "pull-requests"],
    "models": [],
    "featured": false,
    "license": "cc0"
  }]
}
```

Field rules:
- `key` is globally unique and stable; it is the upsert key, `prompts.seed_key`. It is kebab-case, at most 80 chars, and starts with the category slug.
- `title` is 8-100 chars and `description` 20-300.
- `body` is 40-8000 chars, uses `{{key}}` only, and every key must be declared in `variables`.
- `variables` may be empty. `exampleOutput` is required for seeds (≤ 6000) and must be realistic and plausibly generated from the defaults.
- `notes` is optional (≤ 2000) and recommended.
- `useCase` comes from USE_CASES and `tags` has 1-5 entries.
- **Canonical tags:** `content/tags.json` (foundation-written, about 60-80 entries: `[{ "slug": "code-review", "name": "Code review" }]`) is the shared tag vocabulary for seed writers. `seed:check` prints a warning (not an error) for any seed tag outside it, so writers do not invent near-duplicates like `pr-review` / `codereview`. User-submitted tags are not restricted.
- `models: []` means any model.
- `license` defaults to `cc0` for seeds.
- No `testedOn` claims, ratings, comments or counters are seeded.

`scripts/seed.ts` (`pnpm db:seed`) is idempotent:
- Validate every file (zod plus `normalizeTemplate`) and fail on any error. `--check` validates only, with no DB access.
- Upsert the system user `lp_system` / profile `lazyprompt` (trust 3, isSystem), the categories by slug, and the tags.
- Upsert prompts by `seed_key`:
  - New prompts are inserted as published with a shortId, slug and v1.
  - If title, description, body, variables, exampleOutput or notes changed, update the prompt and add version N+1.
  - Tags and models are replaced. Counters are untouched.
- Recompute category and tag counts, then print `inserted/updated/unchanged`.
- `--fixtures` loads `tests/fixtures/prompts.json` (12 short prompts, one per category) for tests and dev.
- `scripts/seed-demo.ts` creates fake users, ratings and comments for **local only**. It refuses unless the DB host is localhost.

## 17. Environment variables

| var | where | notes |
|---|---|---|
| `DATABASE_URL` | all | pooled on Neon; local `postgres://localhost:5432/lazyprompt` |
| `DATABASE_URL_UNPOOLED` | migrate/seed | direct; falls back to DATABASE_URL |
| `TEST_DATABASE_URL` | tests | `postgres://localhost:5432/lazyprompt_test` |
| `TEST_DATABASE_URL_E2E`, `E2E_PORT`, `E2E_MAGIC_LINK_SINK` | e2e | `postgres://localhost:5432/lazyprompt_e2e`, `3100`, `.data/e2e-magic-links-$E2E_PORT.jsonl`. All test resources are env-overridable per worktree via a gitignored `.env.test.local` (README "Parallel worktrees"); `pnpm db:test:prepare` creates and migrates both databases |
| `BETTER_AUTH_SECRET` | all | 32+ random bytes |
| `BETTER_AUTH_URL` | optional | overrides base URL |
| `NEXT_PUBLIC_SITE_URL` | prod | canonical origin `https://lazyprompt.ai` |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | optional | the provider is hidden when unset |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | without them, magic links go to the console and `MAGIC_LINK_DEV_SINK` |
| `MAGIC_LINK_DEV_SINK` | dev/test | file path (e.g. `.data/magic-links.jsonl`); ignored when `VERCEL_ENV=production` |
| `ADMIN_EMAILS` | all | comma-separated |
| `OPENAI_API_KEY` | optional | moderation only |
| `IP_HASH_SALT` | all | random |
| `CRON_SECRET` | Vercel | cron auth |
| `MCP_OAUTH_ENABLED` | optional | `true` enables the write tools and the gate |
| `MCP_AUTH_CHALLENGE` | optional | `auto` (default) \| `http401` \| `result`; how write tools challenge an unauthenticated call (§12) |
| `MCP_WIDGET_DOMAIN` | optional | `_meta.ui.domain` |
| `SEO_NOINDEX` | preview | `true` |
| `SEED_ON_BUILD` | preview | `true` runs `db:seed` in `vercel-build` |
| `REPORT_AUTOHIDE_THRESHOLD` | optional | default 3 |
| Vercel system: `VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL` | auto | used by `getBaseUrl()` |

**`src/lib/env.ts` is lazy and never throws at import.** `env` is a Proxy that zod-parses `process.env` on the first property access and memoizes the result, so `drizzle-kit`, `tsx` scripts and the Better Auth CLI can import modules that reference it.
- Always required: `DATABASE_URL`.
- Required when `VERCEL_ENV` is `production` or `preview`: `BETTER_AUTH_SECRET`, `IP_HASH_SALT`. Elsewhere (local dev, tests, CI) they fall back to fixed, clearly-named dev values (`dev-insecure-...`) with a one-time `console.warn`.
- `CRON_SECRET` is optional; when unset, `/api/cron/recompute` always returns 401.
- A missing required var throws an error naming the variable at the point of first use.

`getBaseUrl()` resolves in this order:
1. `BETTER_AUTH_URL`
2. production: `NEXT_PUBLIC_SITE_URL` or `https://$VERCEL_PROJECT_PRODUCTION_URL`
3. preview: `https://$VERCEL_BRANCH_URL` (stable per branch, so register it as an OAuth callback)
4. `https://$VERCEL_URL`
5. `http://localhost:3000`

## 18. Testing and CI

- **Vitest 5**, with exactly three `test.projects` (`environmentMatchGlobs` no longer exists, so the environment is chosen by project):
  - `unit`: node env, include `tests/unit/**/*.test.ts`.
  - `unit-dom`: jsdom env, include `tests/unit/**/*.dom.test.tsx`, setup adds `@testing-library/jest-dom/vitest`. Sync client components only (Vitest cannot render async RSC).
  - `integration`: node env, include `tests/integration/**/*.test.ts`, `fileParallelism: false`.
  - Scripts: `test:unit` = `vitest run --project unit --project unit-dom`; `test:integration` = `vitest run --project integration`.
  - **File-name rule:** DOM tests must be named `*.dom.test.tsx`; everything else `*.test.ts`. No package edits `vitest.config.ts` or uses per-file environment docblocks.
- **Setup:**
  - `globalSetup` (`tests/helpers/global-setup.ts`) creates `lazyprompt_test` if it is missing, creates the extensions, and runs migrations.
  - `setupFiles` mock `server-only`, `next/headers`, `next/cache` and `next/navigation`. In the mock, `redirect`/`notFound` throw errors with a `digest` of `NEXT_REDIRECT;...` / `NEXT_HTTP_ERROR_FALLBACK;404`, and `unstable_rethrow` rethrows exactly those, so `toActionResult` behaves as in Next.
- **Helpers** (foundation): `tests/helpers/db.ts` (`resetDb()` truncates all app tables plus auth tables with RESTART IDENTITY CASCADE) and `tests/helpers/factories.ts`:
  ```ts
  createUser(opts?: {role?, trustLevel?, email?, createdAt?}): Promise<Viewer>
  createCategory()
  createPrompt(author: Viewer, overrides?: Partial<PromptInput> & { status?: PromptStatus }): Promise<{ id, shortId, slug }>
  ```
- **Playwright** (chromium):
  - `webServer`: `pnpm build && pnpm start -p 3100` with env `DATABASE_URL=$TEST_DATABASE_URL_E2E` (`lazyprompt_e2e`), `MAGIC_LINK_DEV_SINK=.data/e2e-magic-links.jsonl`, `ADMIN_EMAILS=admin@e2e.test` and `SEO_NOINDEX=false`.
  - The `webServer` command is `pnpm db:test:prepare && pnpm build && pnpm start -p $E2E_PORT` (migrate first, because `next build` loads the auth plugins). `globalSetup` runs after the server is up: it migrates, resets and seeds `--fixtures`. The reset keeps `jwks` and `oauth_resource`, which the running server seeds once at startup. Port, DB and sink file come from `E2E_PORT`, `TEST_DATABASE_URL_E2E` and `E2E_MAGIC_LINK_SINK`.
  - Helper `signIn(page, email)` in `tests/e2e/helpers/auth.ts` submits the magic-link form, reads the sink file and visits the link.
  - Spec files: one per package, `tests/e2e/<pkg>.spec.ts`.
- **What to test:**
  - unit: template parser/renderer (incl. escapes, malformed, duplicates, defaults), deep links (length fallback), ranking math, heuristics, slug utils, validation schemas, JSON-LD builders, MCP tool schemas.
  - integration: every `src/server` function, including authz denials, counter invariants, dedupe, rate limits, status transitions, search relevance, and MCP JSON-RPC calls against the route handler (`POST` with a `Request`).
  - e2e: the main user journeys.
- **CI** (`.github/workflows/ci.yml`) runs on push and PR. Job `check`: ubuntu, Node 24, `pnpm/action-setup@v4`, and service `postgres:17` with `POSTGRES_HOST_AUTH_METHOD=trust` (contrib ships pg_trgm and citext).
  - Job-level `env` (needed because `sitemap.ts`, `robots.ts`, `feed.xml`, `llms.txt` and the root `opengraph-image` export `revalidate = 3600` and are prerendered by `next build`):
    `DATABASE_URL=postgres://postgres@localhost:5432/lazyprompt_test`, `TEST_DATABASE_URL` (same), `BETTER_AUTH_SECRET=ci-dummy-secret-0123456789abcdef0123456789`, `IP_HASH_SALT=ci-dummy-salt`, `CRON_SECRET=ci-dummy-cron`, `SEO_NOINDEX=true`.
  - Steps:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm lint`
  3. `pnpm typecheck`
  4. `pnpm seed:check`
  5. `pnpm widget:build && git diff --exit-code src/mcp/widget-html.generated.ts`
  6. `pnpm test:unit`
  7. `pnpm test:integration` (its globalSetup creates and migrates the DB)
  8. `pnpm db:migrate` (idempotent; guarantees the schema exists for prerendering)
  9. `pnpm build`
  - Independently of CI, the build-time SEO routes wrap every DB call in try/catch and degrade to static entries, so a build never fails because the DB is empty or unreachable.
- **CI job `e2e`** (needs `check`): Playwright install chromium, then `pnpm test:e2e`. Upload the report on failure.

## 19. Local development

1. Install Node 24 (`.nvmrc`; the local Node 26 may work, but Vitest 5 declares ^22.12 || ^24) and pnpm 10.33.1 (`packageManager`).
2. Run `createdb lazyprompt && createdb lazyprompt_test`. Postgres 17 runs on localhost:5432 with no password for the current user.
3. `cp .env.example .env.local`, then set `BETTER_AUTH_SECRET` and `IP_HASH_SALT` (`openssl rand -base64 32`). `pnpm build` locally needs the same: a migrated `DATABASE_URL` plus those values (or the CI env block from §18).
4. `pnpm install && pnpm db:migrate && pnpm db:seed` (or `--fixtures`), then `pnpm dev`.
5. Sign in with a magic link: the link is printed to the terminal. Add your email to `ADMIN_EMAILS` for admin access.
6. MCP: `npx @modelcontextprotocol/inspector@latest` → `http://localhost:3000/mcp`. For ChatGPT dev mode, use `cloudflared tunnel --url http://localhost:3000` and set `BETTER_AUTH_URL` to the tunnel URL.

Scripts:
- App: `dev`, `build`, `start`, `vercel-build` (`pnpm db:migrate && ([ "$SEED_ON_BUILD" = true ] && pnpm db:seed || true) && next build`).
- Quality: `lint` (`eslint .`), `typecheck` (`next typegen && tsc --noEmit`), `test`, `test:unit`, `test:integration`, `test:e2e`.
- Database: `db:generate`, `db:migrate` (`tsx scripts/migrate.ts`), `db:seed`, `seed:check`, `db:seed:demo`, `db:reset` (local only).
- Other: `widget:build`, `db:test:prepare`, `auth:generate` (`npx auth@latest generate --config src/auth/server.ts --output .data/auth-generated.ts`, for diffing only; the output must stay outside `src/db/schema/` because drizzle-kit loads every file in that directory).

## 20. Vercel preview deployment (captain)

1. **Link the project.** Run `vercel link` (new project `lazyprompt-v2`, or the existing one), framework Next.js, root `/`. `vercel.json`: `{ "buildCommand": "pnpm vercel-build", "crons": [{ "path": "/api/cron/recompute", "schedule": "0 4 * * *" }] }`. Do **not** set `installCommand`.
2. **Database.** Storage → Neon (Vercel-managed), connected to Preview (and Development). Read the injected var names and confirm `DATABASE_URL` / `DATABASE_URL_UNPOOLED` exist. Automated preview branching is optional; one preview DB is fine for v1.
3. **Preview-scoped env.** Set `BETTER_AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, `ADMIN_EMAILS`, `SEO_NOINDEX=true`, `SEED_ON_BUILD=true`, and optionally `RESEND_API_KEY`/`EMAIL_FROM` and the GitHub/Google OAuth credentials, registered with the callback `https://<branch-url>/api/auth/callback/{github,google}`.
   - Without Resend, magic links only reach the Vercel logs. That is acceptable for owner testing; otherwise verify a Resend sending domain.
   - Resend DNS for lazyprompt.ai would be configured at GoDaddy, but that is a production concern the owner handles.
4. **Deploy.** Push `claude/lazyprompt-v2` → Vercel builds a preview, or run `vercel deploy` (preview, never `--prod`). The build migrates and seeds.
5. **Smoke test.** `/api/health`; home; a prompt page; magic-link sign-in (link from the logs); rate/comment; `/admin` with the admin email; `curl -X POST <preview>/mcp` with `initialize` + `tools/list`; `/robots.txt` disallow-all.
6. **Deployment protection.** Previews are behind Vercel Authentication by default, which blocks ChatGPT/Claude from reaching `/mcp`. To test the connector, either use a local tunnel, or have the owner disable protection for that preview or project.
   - Add the connector with the **branch URL** (`https://<VERCEL_BRANCH_URL>/mcp`), because `resource` and the token `aud` are bound to `getBaseUrl()`; a per-deployment URL fails the audience check.
   - **Vercel crons do not run on preview deployments.** On the preview, rankings refresh only through the opportunistic `maybeRecomputeRankings()` path, or by calling `/api/cron/recompute` manually with the bearer secret.
7. **Production cutover** (the owner, later): attach lazyprompt.ai, set `NEXT_PUBLIC_SITE_URL`, remove `SEO_NOINDEX`, and decide `SEED_ON_BUILD`.

## 21. File tree

```
.github/workflows/ci.yml
.env.example  .nvmrc  .gitignore  README.md  package.json  pnpm-lock.yaml
next.config.ts  tsconfig.json  eslint.config.mjs  postcss.config.mjs  components.json
drizzle.config.ts  vitest.config.ts  playwright.config.ts  vercel.json
docs/ARCHITECTURE.md  docs/research/*
drizzle/0000_extensions.sql  drizzle/0001_init.sql  drizzle/meta/*   (drizzle/0002_oauth.sql only via the §3 MCP exception)
content/categories.json  content/tags.json  content/prompts/<category>.json
scripts/migrate.ts  scripts/seed.ts  scripts/seed-schema.ts  scripts/seed-demo.ts  scripts/embed-widget.ts
widget/index.html  widget/vite.config.ts  widget/src/{main.tsx,App.tsx,ListView.tsx,CardView.tsx,styles.css}
src/proxy.ts
src/app/layout.tsx  globals.css  not-found.tsx  global-error.tsx  icon.svg
src/app/(site)/layout.tsx  error.tsx  page.tsx
src/app/(site)/prompts/page.tsx  c/[category]/page.tsx  t/[tag]/page.tsx
src/app/(site)/p/[slug]/{page.tsx,loading.tsx,not-found.tsx,opengraph-image.tsx}
src/app/(site)/p/[slug]/edit/page.tsx  p/[slug]/versions/page.tsx  p/[slug]/versions/[version]/page.tsx
src/app/(site)/submit/page.tsx  u/[username]/page.tsx  me/{prompts,saved}/page.tsx  settings/page.tsx
src/app/(site)/sign-in/page.tsx  sign-in/check-email/page.tsx
src/app/(site)/{about,guidelines,privacy,terms,apps}/page.tsx
src/app/(site)/oauth/consent/page.tsx
src/app/admin/{layout.tsx,page.tsx,queue/page.tsx,reports/page.tsx,prompts/page.tsx,users/page.tsx,log/page.tsx}
src/app/api/auth/[...all]/route.ts  api/events/route.ts  api/cron/recompute/route.ts  api/health/route.ts
src/app/api/tags/suggest/route.ts  api/well-known/[...path]/route.ts
src/app/mcp/route.ts  sitemap.ts  robots.ts  opengraph-image.tsx  feed.xml/route.ts  llms.txt/route.ts
src/actions/{prompts,ratings,comments,saves,reports,profile,admin}.ts
src/auth/{server.ts,client.ts,viewer.ts,mcp-plugins.ts,email.ts}
src/db/index.ts  src/db/profiles.ts  src/db/schema/{index.ts,auth.ts,auth-oauth.ts,app.ts}
src/lib/{constants,types,validation,errors,slug,models,env,base-url,utils,analytics}.ts  src/lib/template/{index,parse,render}.ts
src/lib/seo/{metadata.ts,jsonld.ts,fonts/*}
src/server/prompts/{mappers,queries,mutations}.ts  src/server/{taxonomy,ratings,comments,saves,usage,reports,users,rate-limit}.ts
src/server/moderation/{screening,queue,actions}.ts  src/server/ranking/{score,recompute}.ts  src/server/search/sql.ts
src/mcp/{server.ts,tools/*.ts,auth.ts,widget-resource.ts,widget-html.generated.ts}
src/components/ui/*            (shadcn + linkify, stars-display, empty-state, pagination-links)
src/components/layout/*        (site-header, site-footer, user-menu, search-box, theme-toggle, container)
src/components/auth/*          (sign-in-form)
src/components/prompt/*        (prompt-card, prompt-grid, filters-bar, use-panel, variable-form, prompt-preview, open-in-menu, copy-button, feedback-bar)
src/components/community/*     (rating-widget, save-button, comments-section, comment-item, report-button, fork-button, author-actions, prompt-form, tag-input)
src/components/admin/*         src/components/seo/json-ld.tsx
tests/helpers/*  tests/fixtures/prompts.json  tests/unit/<pkg>/*  tests/integration/<pkg>/*  tests/e2e/<pkg>.spec.ts  tests/e2e/helpers/*
```

## 22. Package boundaries (summary)

- The foundation lands everything shared, including stub files with final signatures for modules that parallel packages own. A stub throws `notImplemented()`, or renders a placeholder for components.
- Parallel packages own disjoint paths. **No parallel package may change the schema, migrations, `package.json` deps, `vitest.config.ts`, `src/lib/**` (other than the SEO package's own `src/lib/seo/**` and `src/lib/analytics.ts`) or `next.config.ts`.** Needed changes are recorded in the package's final report for the captain to apply after merge. The one exception is the MCP OAuth schema (§3).
- Packages: `foundation` → then in parallel `data-read`, `data-write`, `browse-ui`, `community-ui`, `admin`, `mcp`, `seo`.
  - **data-read:** `src/server/prompts/{mappers,queries}.ts`, `taxonomy.ts`, `search/**`, `ranking/**`, `usage.ts`, `/api/events`, `/api/cron`.
  - **data-write:** `src/server/prompts/mutations.ts`, `ratings.ts`, `comments.ts`, `saves.ts`, `reports.ts`, `users.ts`, `moderation/**`, `rate-limit.ts`.
  - The foundation implements for real everything both data packages lean on across the split: `rate-limit.ts`, `findSimilarPrompts`, `mappers.ts`, `ensureProfile` (in `src/db/profiles.ts`), `ranking/score.ts`, plus the simple reads listed in its instructions.
- Prompt-card contracts that community (`/u`, `/me/*`) imports, with stubs from foundation, implemented by browse:
  - `PromptCard({ prompt, showStatus? }: { prompt: PromptCardData & { status?: PromptStatus; moderationNote?: string | null }; showStatus?: boolean })` in `src/components/prompt/prompt-card.tsx`. The file imports the DTO as `import type { PromptCard as PromptCardData } from "@/lib/types"` to avoid the name clash; consumers do the same when they need the type.
  - `PromptGrid({ prompts, showStatus? })` in `src/components/prompt/prompt-grid.tsx`.
- Community component contracts that browse imports, all implemented by community, with stubs from foundation:
  - `RatingWidget({promptId, slug, ratingAvg, ratingCount, viewerRating, signedIn, isAuthor})`; browse passes `viewerState.isAuthor`
  - `SaveButton({promptId, slug, saved, saveCount, signedIn})`
  - async `CommentsSection({promptId, slug, commentCount})`
  - `ReportButton({targetType, targetId, signedIn})`
  - `ForkButton({shortId, signedIn})`
  - `AuthorActions({promptId, shortId, slug, status})`
- SEO contracts that browse and community import (foundation stubs, implemented by seo):
  - `buildMetadata({title, description, path, noindex?, ogImage?, type?}): Metadata`, with `type?: "website" | "article"` (default `website`; prompt pages pass `article`)
  - `promptJsonLd(p: PromptDetail): object[]`
  - `itemListJsonLd(items: PromptCard[], path: string): object`
  - `websiteJsonLd(): object`
  - `<JsonLd data={...}/>`
  - `trackEvent(name, props?)`

## 23. Build orchestration (captain)

1. **Commit the spec first.** `docs/` (this file and `docs/research/*`) must be committed on `claude/lazyprompt-v2` **before** the foundation worktree is created, and the foundation must branch from that commit. Check with `git show <foundation-base>:docs/ARCHITECTURE.md` (it must succeed). Every later worktree branches from the merged foundation commit, so it inherits the spec.
2. **Foundation** runs alone. The captain merges it into `claude/lazyprompt-v2` once its acceptance checks pass, and records the merge SHA as the common base.
3. **Parallel packages** start from that SHA, each in its own worktree and `claude/lazyprompt-v2-<pkg>` branch: data-read, data-write, browse-ui, community-ui, admin, mcp, seo. Content writers (seed prompts) can run at the same time, since they only add `content/prompts/*.json`.
4. **Merge order:** data-read → data-write → seo → browse-ui → community-ui → admin → mcp → content. After **each** merge, run `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:integration && pnpm build`, then that package's `tests/e2e/<pkg>.spec.ts` (none of the UI e2e specs can pass in-branch, because they need the real data layer). After both data packages merge, also check `grep -rn notImplemented src/server` is empty and `GET /api/cron/recompute` reports a numeric `trustUpdated`.
5. **Report-driven fixes.** Apply the dependency/schema/shared-lib requests from each package report after its merge, in one captain commit per package.
6. **Preview** per §20, from the fully merged branch.

## 24. Advisor review — changes applied

Required changes (all applied):
1. **Spec availability in worktrees:** added §23 step 1 (commit `docs/` before creating the foundation worktree; verify with `git show <base>:docs/ARCHITECTURE.md`).
2. **Actions vs navigation:** `toActionResult` now calls `unstable_rethrow` first; added `requireViewerForAction()` / `requireAdminForAction()` (throw `AppError`, never navigate); every action uses them, and clients route UNAUTHENTICATED to `/sign-in?next=` (§7, §8, §10). The test mock of `next/navigation` implements `unstable_rethrow` (§18).
3. **Admin authorization:** `await requireAdmin()` is the first statement of every admin page (plus layout and actions), and every `moderation/queue.ts` read now takes `admin: Viewer` and asserts the role. This is a signature change made deliberately, since nothing is built yet (§7, §10).
4. **Cross-package UI contracts:** the foundation stubs `PromptCard` / `PromptGrid` in `src/components/prompt` (browse owns them afterwards; the DTO is imported as `PromptCardData`), and `RatingWidget` gains `isAuthor` (§22).
5. **`server-only` in the CLI import graph:** added the import-graph rule; `ensureProfile` moved to `src/db/profiles.ts` and is re-exported by `src/server/users.ts`; `env.ts` is a lazy Proxy with dev fallbacks (§7, §10, §17).
6. **CI build:** added the job-level env block, `pnpm db:migrate` before `pnpm build`, try/catch degradation in the build-time SEO routes, and a local-build note (§18, §19).
7. **MCP auth:** `MCP_AUTH_CHALLENGE=auto|http401|result` makes both challenge paths reachable and tested; the HTTP gate uses `createMcpProtectedRequestHandler` from `@better-auth/mcp`, and `verifyToken` shares its verification; `securitySchemes` lives only in `_meta`; widget-callable tools set `openai/widgetAccessible` and `ui.visibility: ["model","app"]` (§12, §17).
8. **Vitest:** three projects (`unit`, `unit-dom`, `integration`), the `*.dom.test.tsx` naming rule, `@testing-library/jest-dom` added to dev deps (§18).

Suggestions applied: React `cache()` wrappers with primitive keys (§7, §9); SQL definition of a distinct actor for Trending (§4); MCP rate limit by subject with a 600/min per-IP ceiling (§11, §12); PRM proxied from Better Auth (§12); data package split into data-read and data-write, with the foundation implementing the cross-split helpers for real (§22); merge order with e2e after each merge (§23); the single MCP schema exception for `auth-oauth.ts` + `0002_oauth.sql` (§3); canonical `content/tags.json` with a `seed:check` warning (§16); `buildMetadata` `type` (§22); hardened `safeNext` and a server-side self-ban check (§7, §10); `cookieCache.maxAge` lowered to 60 s and `getViewer` reading `banned`/`role` from the DB (§10); preview notes on crons and the branch-URL audience (§12, §20); verified MCP exports listed (§12).

Suggestions modified:
- *Admin read assertions:* applied via an explicit `admin: Viewer` argument rather than an internal `getViewer()` call. This matches the actor-first convention and keeps the functions testable without request mocks.
- *Challenge-mode selection:* both of the advisor's options are combined (an env var with an `auto` UA mode as the default), since one deployment must serve both ChatGPT and Claude.

Suggestions rejected: none.
