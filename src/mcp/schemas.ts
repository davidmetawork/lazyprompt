// Tool input schemas (zod 4). Pure module: shared by the tool registrations and the unit tests.
// Tool names, descriptions and these schemas lock once the app is published in ChatGPT (ARCHITECTURE.md section 12).
import { z } from "zod";
import { AI_MODELS, SORT_KEYS } from "@/lib/constants";

const CATEGORY_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;

export const searchPromptsInput = z.object({
  query: z.string().trim().min(1).max(200).optional()
    .describe("Topic or task to search for, for example 'cold email' or 'weekly meal plan'. Omit to list the top-rated prompts."),
  category: z.string().regex(CATEGORY_SLUG, "Use a category slug from list_categories").optional()
    .describe("Only return prompts in this category. Use a slug from list_categories."),
  model: z.enum(AI_MODELS).optional()
    .describe("Only return prompts that work with this AI model (prompts that do not name a model are included)."),
  sort: z.enum(SORT_KEYS).optional()
    .describe("relevance (default when a query is given), top (default otherwise), trending or new."),
  limit: z.number().int().min(1).max(10).default(5).describe("How many prompts to return (1-10, default 5)."),
});

const promptId = z.string().trim().min(1).max(200)
  .describe("The prompt id returned by search_prompts (a 7-character id), or the slug from a lazyprompt.ai/p/ link.");

export const getPromptInput = z.object({ id: promptId });

export const renderPromptInput = z.object({
  id: promptId,
  values: z.record(z.string().min(1).max(64), z.string().max(4000))
    .refine((v) => Object.keys(v).length <= 20, "At most 20 values")
    .describe("Variable values keyed by variable key, as listed by get_prompt. Leave out variables the user has not provided."),
});

export const listCategoriesInput = z.object({});

export const ratePromptInput = z.object({
  id: promptId,
  stars: z.number().int().min(1).max(5).describe("The user's rating from 1 (poor) to 5 (excellent)."),
});

export const savePromptInput = z.object({ id: promptId });

export type SearchPromptsInput = z.infer<typeof searchPromptsInput>;
export type RenderPromptInput = z.infer<typeof renderPromptInput>;
