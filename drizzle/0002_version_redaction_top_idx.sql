DROP INDEX "prompts_top_idx";--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "approved_from_version" integer;--> statement-breakpoint
-- Prompts that were ever public keep their whole history visible; never-approved ones stay null until an approval.
UPDATE "prompts" SET "approved_from_version" = 1 WHERE "published_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "prompts_top_idx" ON "prompts" USING btree ("bayes_score" DESC NULLS LAST,"is_featured" DESC NULLS LAST,"copy_count" DESC NULLS LAST) WHERE "prompts"."status" = 'published';