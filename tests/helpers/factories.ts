// Test factories. They INSERT rows directly and never call src/server mutation functions
// (those are built by other packages and tested separately).
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, profiles, promptModels, promptTags, promptVersions, prompts, tags, user } from "@/db/schema";
import { buildPromptSlug, newShortId, normalizeTag } from "@/lib/slug";
import type { PromptInput } from "@/lib/validation";
import type { PromptStatus, TrustLevel, Viewer } from "@/lib/types";

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function createUser(opts: {
  role?: "user" | "admin"; trustLevel?: TrustLevel; email?: string; createdAt?: Date; name?: string; banned?: boolean;
} = {}): Promise<Viewer> {
  const id = `u_${uniq()}`;
  const email = opts.email ?? `${id}@test.local`;
  const name = opts.name ?? `User ${id.slice(-5)}`;
  const createdAt = opts.createdAt ?? new Date();
  const username = `u${uniq()}`.slice(0, 30).toLowerCase().replace(/[^a-z0-9]/g, "");
  await db.insert(user).values({
    id, name, email, emailVerified: true, role: opts.role ?? "user", banned: opts.banned ?? false, createdAt, updatedAt: createdAt,
  });
  await db.insert(profiles).values({ userId: id, username, trustLevel: opts.trustLevel ?? 0 });
  return {
    id, name, email, image: null, username, role: opts.role ?? "user", trustLevel: opts.trustLevel ?? 0,
    createdAt: createdAt.toISOString(), banned: opts.banned ?? false,
  };
}

export async function createCategory(overrides: { slug?: string; name?: string; sortOrder?: number } = {}): Promise<{ id: string; slug: string; name: string }> {
  const slug = overrides.slug ?? `cat-${uniq()}`;
  const name = overrides.name ?? `Category ${slug}`;
  const [row] = await db.insert(categories).values({
    slug, name, description: `Description for ${name}`, icon: "sparkles", sortOrder: overrides.sortOrder ?? 0,
  }).returning({ id: categories.id });
  return { id: row!.id, slug, name };
}

export async function createPrompt(
  author: Viewer,
  overrides: Partial<PromptInput> & { status?: PromptStatus; isFeatured?: boolean; bayesScore?: number; copyCount?: number;
    ratingCount?: number; ratingSum?: number; publishedAt?: Date } = {},
): Promise<{ id: string; shortId: string; slug: string }> {
  const status = overrides.status ?? "published";
  const title = overrides.title ?? `Test prompt ${uniq()}`;
  const shortId = newShortId();
  const slug = buildPromptSlug(title, shortId);

  let categoryId: string;
  if (overrides.categorySlug) {
    const [c] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, overrides.categorySlug)).limit(1);
    categoryId = c?.id ?? (await createCategory({ slug: overrides.categorySlug })).id;
  } else {
    categoryId = (await createCategory()).id;
  }

  const tagSlugs = [...new Set((overrides.tags ?? []).map((t) => normalizeTag(t)).filter((t): t is string => Boolean(t)))];
  const tagRows: { id: string; name: string }[] = [];
  for (const slugValue of tagSlugs) {
    const name = slugValue.replace(/-/g, " ");
    const [row] = await db.insert(tags).values({ slug: slugValue, name })
      .onConflictDoUpdate({ target: tags.slug, set: { name } }).returning({ id: tags.id, name: tags.name });
    tagRows.push(row!);
  }

  const body = overrides.body ?? "Write a clear, friendly message about the topic below.\n\nTopic: {{topic}}";
  const variables = overrides.variables ?? [{ key: "topic", label: "Topic", type: "text" as const, required: true }];
  const publishedAt = status === "published" ? (overrides.publishedAt ?? new Date()) : null;

  const [row] = await db.insert(prompts).values({
    shortId, slug, authorId: author.id, title,
    description: overrides.description ?? "A short test description that is long enough to be realistic.",
    body, variables, exampleOutput: overrides.exampleOutput ?? null, notes: overrides.notes ?? null,
    categoryId, useCase: overrides.useCase ?? "generate", license: overrides.license ?? "cc_by_4",
    status, tagsText: tagRows.map((t) => t.name).join(" "), isFeatured: overrides.isFeatured ?? false,
    bayesScore: overrides.bayesScore ?? 0, copyCount: overrides.copyCount ?? 0,
    ratingCount: overrides.ratingCount ?? 0, ratingSum: overrides.ratingSum ?? 0, publishedAt,
  }).returning({ id: prompts.id });
  const id = row!.id;

  await db.insert(promptVersions).values({
    promptId: id, version: 1, title, description: overrides.description ?? "A short test description that is long enough to be realistic.",
    body, variables, editorId: author.id,
  });
  if (tagRows.length) await db.insert(promptTags).values(tagRows.map((t) => ({ promptId: id, tagId: t.id })));
  if (overrides.models?.length) await db.insert(promptModels).values(overrides.models.map((model) => ({ promptId: id, model })));

  // Keep denormalized counts consistent for list/count assertions.
  await db.execute(sql`UPDATE categories c SET prompt_count =
    (SELECT count(*)::int FROM prompts p WHERE p.category_id = c.id AND p.status = 'published') WHERE c.id = ${categoryId}`);
  if (tagRows.length) {
    await db.execute(sql`UPDATE tags t SET prompt_count = (SELECT count(*)::int FROM prompt_tags pt JOIN prompts p ON p.id = pt.prompt_id
      WHERE pt.tag_id = t.id AND p.status = 'published') WHERE t.id IN (${sql.join(tagRows.map((t) => sql`${t.id}`), sql`, `)})`);
  }
  return { id, shortId, slug };
}
