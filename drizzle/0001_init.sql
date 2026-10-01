CREATE TYPE "public"."ai_model" AS ENUM('chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'copilot', 'mistral', 'deepseek', 'llama', 'midjourney', 'stable_diffusion', 'flux', 'sora', 'veo');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('visible', 'pending', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('web', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."license" AS ENUM('cc0', 'cc_by_4');--> statement-breakpoint
CREATE TYPE "public"."mod_action" AS ENUM('approve', 'reject', 'hide', 'restore', 'remove', 'feature', 'unfeature', 'auto_flag', 'auto_hide', 'ban', 'unban', 'set_trust', 'resolve_report', 'dismiss_report');--> statement-breakpoint
CREATE TYPE "public"."prompt_status" AS ENUM('draft', 'pending', 'published', 'rejected', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('spam', 'broken', 'jailbreak', 'nsfw', 'harassment', 'copyright', 'personal_data', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('prompt', 'comment', 'user');--> statement-breakpoint
CREATE TYPE "public"."usage_event_type" AS ENUM('copy', 'open', 'render', 'worked', 'not_worked');--> statement-breakpoint
CREATE TYPE "public"."use_case" AS ENUM('generate', 'rewrite', 'summarize', 'extract', 'analyze', 'brainstorm', 'plan', 'critique', 'translate', 'tutor', 'roleplay', 'system_prompt');--> statement-breakpoint
CREATE TABLE "app_rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(48) NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(300) NOT NULL,
	"icon" varchar(40) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_id" uuid,
	"depth" smallint DEFAULT 0 NOT NULL,
	"body" varchar(2000) NOT NULL,
	"status" "comment_status" DEFAULT 'visible' NOT NULL,
	"moderation_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"open_report_count" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_depth_range" CHECK ("comments"."depth" in (0, 1)),
	CONSTRAINT "comments_parent_depth" CHECK (("comments"."depth" = 0) = ("comments"."parent_id" is null))
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"target_type" "report_target" NOT NULL,
	"target_id" text NOT NULL,
	"action" "mod_action" NOT NULL,
	"reason" varchar(500),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" citext NOT NULL,
	"bio" varchar(280),
	"website" varchar(200),
	"trust_level" smallint DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"published_prompt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_username_unique" UNIQUE("username"),
	CONSTRAINT "profiles_trust_range" CHECK ("profiles"."trust_level" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "prompt_models" (
	"prompt_id" uuid NOT NULL,
	"model" "ai_model" NOT NULL,
	"tested_version" varchar(60),
	"tested_at" date,
	CONSTRAINT "prompt_models_prompt_id_model_pk" PRIMARY KEY("prompt_id","model")
);
--> statement-breakpoint
CREATE TABLE "prompt_tags" (
	"prompt_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "prompt_tags_prompt_id_tag_id_pk" PRIMARY KEY("prompt_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb NOT NULL,
	"example_output" text,
	"notes" text,
	"change_note" varchar(200),
	"editor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"short_id" varchar(12) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"seed_key" varchar(80),
	"author_id" text NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" varchar(300) NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"example_output" text,
	"notes" text,
	"category_id" uuid NOT NULL,
	"use_case" "use_case" NOT NULL,
	"license" "license" DEFAULT 'cc_by_4' NOT NULL,
	"language" varchar(8) DEFAULT 'en' NOT NULL,
	"status" "prompt_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"forked_from_id" uuid,
	"forked_from_version" integer,
	"is_featured" boolean DEFAULT false NOT NULL,
	"tags_text" text DEFAULT '' NOT NULL,
	"search" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("tags_text", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("body", '')), 'C')) STORED,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_weight_sum" real DEFAULT 0 NOT NULL,
	"rating_weighted_sum" real DEFAULT 0 NOT NULL,
	"bayes_score" double precision DEFAULT 0 NOT NULL,
	"trending_score" double precision DEFAULT 0 NOT NULL,
	"copy_count" integer DEFAULT 0 NOT NULL,
	"open_count" integer DEFAULT 0 NOT NULL,
	"render_count" integer DEFAULT 0 NOT NULL,
	"worked_count" integer DEFAULT 0 NOT NULL,
	"not_worked_count" integer DEFAULT 0 NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"fork_count" integer DEFAULT 0 NOT NULL,
	"open_report_count" integer DEFAULT 0 NOT NULL,
	"moderation_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"moderation_note" text,
	"duplicate_of_id" uuid,
	"reviewed_by_id" text,
	"reviewed_at" timestamp with time zone,
	"auto_hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"removed_at" timestamp with time zone,
	CONSTRAINT "prompts_short_id_unique" UNIQUE("short_id"),
	CONSTRAINT "prompts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "prompts_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "prompts_version_pos" CHECK ("prompts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"user_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"stars" smallint NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_user_id_prompt_id_pk" PRIMARY KEY("user_id","prompt_id"),
	CONSTRAINT "ratings_stars_range" CHECK ("ratings"."stars" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" text NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" text NOT NULL,
	"prompt_id" uuid,
	"reason" "report_reason" NOT NULL,
	"details" varchar(1000),
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saves" (
	"user_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saves_user_id_prompt_id_pk" PRIMARY KEY("user_id","prompt_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(32) NOT NULL,
	"name" varchar(32) NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"alias_of_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"prompt_id" uuid NOT NULL,
	"type" "usage_event_type" NOT NULL,
	"model" "ai_model",
	"source" "event_source" DEFAULT 'web' NOT NULL,
	"user_id" text,
	"actor_hash" varchar(64) NOT NULL,
	"day" date DEFAULT current_date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"client_discovery_id" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"client_credentials_scopes" text[] DEFAULT '{}',
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"backchannel_logout_uri" text,
	"backchannel_logout_session_required" boolean,
	"token_endpoint_auth_method" text,
	"application_type" text,
	"jwks" text,
	"jwks_uri" text,
	"grant_types" text[],
	"response_types" text[],
	"require_pkce" boolean,
	"dpop_bound_access_tokens" boolean DEFAULT false,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"authorization_code_id" text,
	"resources" text[],
	"requested_user_info_claims" text[],
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	"rotation_replay_response" text,
	"rotation_replay_expires_at" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"confirmation" jsonb,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone,
	"alg" text,
	"crv" text
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_models" ADD CONSTRAINT "prompt_models_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tags" ADD CONSTRAINT "prompt_tags_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_tags" ADD CONSTRAINT "prompt_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_editor_id_user_id_fk" FOREIGN KEY ("editor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_forked_from_id_prompts_id_fk" FOREIGN KEY ("forked_from_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_duplicate_of_id_prompts_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_reviewed_by_id_user_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_alias_of_id_tags_id_fk" FOREIGN KEY ("alias_of_id") REFERENCES "public"."tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_prompt_idx" ON "comments" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_status_idx" ON "comments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "mod_actions_target_idx" ON "moderation_actions" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "mod_actions_created_idx" ON "moderation_actions" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prompt_models_model_idx" ON "prompt_models" USING btree ("model");--> statement-breakpoint
CREATE INDEX "prompt_tags_tag_idx" ON "prompt_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_versions_prompt_version_uq" ON "prompt_versions" USING btree ("prompt_id","version");--> statement-breakpoint
CREATE INDEX "prompts_search_idx" ON "prompts" USING gin ("search");--> statement-breakpoint
CREATE INDEX "prompts_title_trgm_idx" ON "prompts" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "prompts_top_idx" ON "prompts" USING btree ("bayes_score" DESC NULLS LAST,"copy_count" DESC NULLS LAST) WHERE "prompts"."status" = 'published';--> statement-breakpoint
CREATE INDEX "prompts_trending_idx" ON "prompts" USING btree ("trending_score" DESC NULLS LAST) WHERE "prompts"."status" = 'published';--> statement-breakpoint
CREATE INDEX "prompts_new_idx" ON "prompts" USING btree ("published_at" DESC NULLS LAST) WHERE "prompts"."status" = 'published';--> statement-breakpoint
CREATE INDEX "prompts_category_status_idx" ON "prompts" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "prompts_author_idx" ON "prompts" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "prompts_status_created_idx" ON "prompts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "prompts_forked_from_idx" ON "prompts" USING btree ("forked_from_id");--> statement-breakpoint
CREATE INDEX "ratings_prompt_idx" ON "ratings" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_open_once_uq" ON "reports" USING btree ("reporter_id","target_type","target_id") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "saves_user_idx" ON "saves" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tags_slug_trgm_idx" ON "tags" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_dedupe_uq" ON "usage_events" USING btree ("prompt_id","type","actor_hash","day");--> statement-breakpoint
CREATE INDEX "usage_events_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_events_prompt_created_idx" ON "usage_events" USING btree ("prompt_id","created_at");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_authorization_code_id_idx" ON "oauth_access_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_resource_client_id_resource_id_uidx" ON "oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_client_id_idx" ON "oauth_client_resource" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_resource_id_idx" ON "oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_authorization_code_id_idx" ON "oauth_refresh_token" USING btree ("authorization_code_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");