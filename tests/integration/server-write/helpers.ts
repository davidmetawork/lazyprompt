import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, comments, profiles, prompts, tags } from "@/db/schema";
import type { PromptInput } from "@/lib/validation";
import type { Viewer } from "@/lib/types";
import { createCategory } from "../../helpers/factories";

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

/** Fresh rate-limit counters (tests that write several times as the same user). */
export async function clearRateLimits(): Promise<void> {
  await db.execute(sql`DELETE FROM app_rate_limits`);
}

export async function ensureCategory(slug = "writing"): Promise<string> {
  const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  return c?.id ?? (await createCategory({ slug })).id;
}

/** A valid PromptInput (everything the zod schema would default is spelled out). */
export function promptInput(overrides: Partial<PromptInput> = {}): PromptInput {
  const t = uniq();
  return {
    title: `Friendly outreach email ${t}`,
    description: `Drafts a short, friendly outreach email for a given topic (${t}).`,
    body: `Write a short, friendly email to {{recipient}} about ${t} and ask one clear question at the end.`,
    variables: [],
    categorySlug: "writing",
    useCase: "generate",
    tags: ["email"],
    models: [],
    license: "cc_by_4",
    ...overrides,
  };
}

export async function promptRow(id: string) {
  const [p] = await db.select().from(prompts).where(eq(prompts.id, id)).limit(1);
  return p!;
}
export async function categoryCount(slug: string): Promise<number> {
  const [c] = await db.select({ n: categories.promptCount }).from(categories).where(eq(categories.slug, slug)).limit(1);
  return c?.n ?? -1;
}
export async function tagCount(slug: string): Promise<number> {
  const [t] = await db.select({ n: tags.promptCount }).from(tags).where(eq(tags.slug, slug)).limit(1);
  return t?.n ?? -1;
}
export async function publishedCount(u: Viewer): Promise<number> {
  const [p] = await db.select({ n: profiles.publishedPromptCount }).from(profiles).where(eq(profiles.userId, u.id)).limit(1);
  return p?.n ?? -1;
}
export async function commentRow(id: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
  return c!;
}
