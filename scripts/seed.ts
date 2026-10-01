// Idempotent seed loader (ARCHITECTURE.md section 16).
//   pnpm db:seed              content/prompts/*.json into DATABASE_URL_UNPOOLED ?? DATABASE_URL
//   pnpm db:seed --fixtures   tests/fixtures/prompts.json instead
//   pnpm seed:check           validate only (no DB): content + fixtures; warns on tags outside content/tags.json
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { eq, inArray, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { categories, profiles, promptModels, promptTags, promptVersions, prompts, tags, user } from "../src/db/schema";
import { SYSTEM_USER_ID } from "../src/lib/constants";
import { buildPromptSlug, newShortId } from "../src/lib/slug";
import { labelFromKey } from "../src/lib/template";
import { isMain, loadDevEnv, REPO_ROOT } from "./lib/env-files";
import {
  categoriesFileSchema, tagsFileSchema, validateSeedFiles, type NormalizedSeedPrompt, type ValidationResult,
} from "./seed-schema";

const CONTENT = resolve(REPO_ROOT, "content");
const FIXTURES = resolve(REPO_ROOT, "tests/fixtures/prompts.json");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadTaxonomy() {
  const cats = categoriesFileSchema.parse(readJson(resolve(CONTENT, "categories.json")));
  const tagList = tagsFileSchema.parse(readJson(resolve(CONTENT, "tags.json")));
  return { cats, tagList };
}

export function loadPromptFiles(): { name: string; data: unknown }[] {
  const dir = resolve(CONTENT, "prompts");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => ({ name: `content/prompts/${f}`, data: readJson(resolve(dir, f)) }));
}

export function loadFixtureFiles(): { name: string; data: unknown }[] {
  const raw = readJson(FIXTURES);
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((data, i) => ({ name: `tests/fixtures/prompts.json#${i}`, data }));
}

export function validateAll(opts: { fixtures: boolean; both?: boolean }): ValidationResult & { categoryCount: number; tagCount: number } {
  const { cats, tagList } = loadTaxonomy();
  const slugs = new Set(cats.map((c) => c.slug));
  const canonical = new Set(tagList.map((t) => t.slug));
  const files = [
    ...(opts.both || !opts.fixtures ? loadPromptFiles() : []),
    ...(opts.both || opts.fixtures ? loadFixtureFiles() : []),
  ];
  const res = validateSeedFiles(files, slugs, canonical);
  return { ...res, categoryCount: cats.length, tagCount: tagList.length };
}

// ---------- DB side ----------

type Counts = { inserted: number; updated: number; unchanged: number };

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

async function upsertSystemUser(): Promise<void> {
  await db.insert(user).values({
    id: SYSTEM_USER_ID, name: "LazyPrompt", email: "system@lazyprompt.invalid", emailVerified: true, role: "user",
  }).onConflictDoNothing();
  await db.insert(profiles).values({
    userId: SYSTEM_USER_ID, username: "lazyprompt", trustLevel: 3, isSystem: true,
    bio: "Starter prompts curated by the LazyPrompt team.",
  }).onConflictDoUpdate({ target: profiles.userId, set: { trustLevel: 3, isSystem: true } });
}

export async function seedDatabase(list: NormalizedSeedPrompt[]): Promise<Counts> {
  const { cats, tagList } = loadTaxonomy();
  const counts: Counts = { inserted: 0, updated: 0, unchanged: 0 };

  await upsertSystemUser();

  for (const c of cats) {
    await db.insert(categories).values(c).onConflictDoUpdate({
      target: categories.slug,
      set: { name: c.name, description: c.description, icon: c.icon, sortOrder: c.sortOrder },
    });
  }
  const catRows = await db.select({ id: categories.id, slug: categories.slug }).from(categories);
  const catId = new Map(catRows.map((r) => [r.slug, r.id]));

  const tagNames = new Map(tagList.map((t) => [t.slug, t.name]));
  for (const t of tagList) {
    await db.insert(tags).values({ slug: t.slug, name: t.name }).onConflictDoUpdate({ target: tags.slug, set: { name: t.name } });
  }
  const usedTags = [...new Set(list.flatMap((p) => p.tags))];
  for (const slug of usedTags) {
    if (tagNames.has(slug)) continue;
    const name = labelFromKey(slug).slice(0, 32);
    tagNames.set(slug, name);
    await db.insert(tags).values({ slug, name }).onConflictDoNothing();
  }
  const tagRows = await db.select({ id: tags.id, slug: tags.slug }).from(tags).where(inArray(tags.slug, usedTags.length ? usedTags : ["-"]));
  const tagId = new Map(tagRows.map((r) => [r.slug, r.id]));

  for (const p of list) {
    const categoryId = catId.get(p.categorySlug);
    if (!categoryId) throw new Error(`category ${p.categorySlug} missing from content/categories.json`);
    const tagIds = p.tags.map((s) => tagId.get(s)!);
    const tagsText = p.tags.map((s) => tagNames.get(s) ?? s).join(" ");

    const [existing] = await db.select().from(prompts).where(eq(prompts.seedKey, p.key)).limit(1);

    if (!existing) {
      let shortId = newShortId();
      for (let i = 0; i < 5; i++) {
        const [clash] = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.shortId, shortId)).limit(1);
        if (!clash) break;
        shortId = newShortId();
      }
      await db.transaction(async (tx) => {
        const [row] = await tx.insert(prompts).values({
          shortId, slug: buildPromptSlug(p.title, shortId), seedKey: p.key, authorId: SYSTEM_USER_ID,
          title: p.title, description: p.description, body: p.body, variables: p.variables,
          exampleOutput: p.exampleOutput, notes: p.notes, categoryId, useCase: p.useCase, license: p.license,
          status: "published", version: 1, isFeatured: p.featured, tagsText, publishedAt: new Date(),
        }).returning({ id: prompts.id });
        const promptId = row!.id;
        await tx.insert(promptVersions).values({
          promptId, version: 1, title: p.title, description: p.description, body: p.body, variables: p.variables,
          exampleOutput: p.exampleOutput, notes: p.notes, changeNote: "Initial version", editorId: SYSTEM_USER_ID,
        });
        if (tagIds.length) await tx.insert(promptTags).values(tagIds.map((tid) => ({ promptId, tagId: tid })));
        if (p.models.length) await tx.insert(promptModels).values(p.models.map((model) => ({ promptId, model })));
      });
      counts.inserted++;
      continue;
    }

    const [curTags, curModels] = await Promise.all([
      db.select({ id: promptTags.tagId }).from(promptTags).where(eq(promptTags.promptId, existing.id)),
      db.select({ model: promptModels.model }).from(promptModels).where(eq(promptModels.promptId, existing.id)),
    ]);
    const material =
      existing.title !== p.title || existing.description !== p.description || existing.body !== p.body ||
      canon(existing.variables) !== canon(p.variables) ||
      (existing.exampleOutput ?? null) !== p.exampleOutput || (existing.notes ?? null) !== p.notes;
    const meta =
      existing.categoryId !== categoryId || existing.useCase !== p.useCase || existing.license !== p.license ||
      existing.isFeatured !== p.featured || existing.tagsText !== tagsText ||
      [...curTags.map((t) => t.id)].sort().join() !== [...tagIds].sort().join() ||
      [...curModels.map((m) => m.model)].sort().join() !== [...p.models].sort().join();

    if (!material && !meta) { counts.unchanged++; continue; }

    await db.transaction(async (tx) => {
      const version = material ? existing.version + 1 : existing.version;
      await tx.update(prompts).set({
        title: p.title, description: p.description, body: p.body, variables: p.variables,
        exampleOutput: p.exampleOutput, notes: p.notes, categoryId, useCase: p.useCase, license: p.license,
        isFeatured: p.featured, tagsText, version,
        slug: existing.title !== p.title ? buildPromptSlug(p.title, existing.shortId) : existing.slug,
      }).where(eq(prompts.id, existing.id));
      if (material) {
        await tx.insert(promptVersions).values({
          promptId: existing.id, version, title: p.title, description: p.description, body: p.body, variables: p.variables,
          exampleOutput: p.exampleOutput, notes: p.notes, changeNote: "Updated from seed", editorId: SYSTEM_USER_ID,
        });
      }
      await tx.delete(promptTags).where(eq(promptTags.promptId, existing.id));
      if (tagIds.length) await tx.insert(promptTags).values(tagIds.map((tid) => ({ promptId: existing.id, tagId: tid })));
      await tx.delete(promptModels).where(eq(promptModels.promptId, existing.id));
      if (p.models.length) await tx.insert(promptModels).values(p.models.map((model) => ({ promptId: existing.id, model })));
    });
    counts.updated++;
  }

  // Recompute published-only counts.
  await db.execute(sql`
    UPDATE categories c SET prompt_count = (SELECT count(*)::int FROM prompts p WHERE p.category_id = c.id AND p.status = 'published')`);
  await db.execute(sql`
    UPDATE tags t SET prompt_count = (
      SELECT count(*)::int FROM prompt_tags pt JOIN prompts p ON p.id = pt.prompt_id
      WHERE pt.tag_id = t.id AND p.status = 'published')`);
  await db.execute(sql`
    UPDATE profiles SET published_prompt_count = (
      SELECT count(*)::int FROM prompts p WHERE p.author_id = profiles.user_id AND p.status = 'published')
    WHERE user_id = ${SYSTEM_USER_ID}`);
  return counts;
}

/** For tests/e2e: seed fixtures into whatever DATABASE_URL points at. */
export async function seedFixtures(): Promise<Counts> {
  const v = validateAll({ fixtures: true });
  if (v.errors.length) throw new Error(`fixture validation failed:\n${v.errors.join("\n")}`);
  return seedDatabase(v.prompts);
}

async function main() {
  loadDevEnv();
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const fixtures = args.has("--fixtures");

  const v = validateAll({ fixtures, both: check && !fixtures });
  for (const w of v.warnings) console.warn(`warn: ${w}`);
  if (v.errors.length) {
    for (const e of v.errors) console.error(`error: ${e}`);
    console.error(`seed validation failed with ${v.errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`validated ${v.prompts.length} prompt(s), ${v.categoryCount} categories, ${v.tagCount} canonical tags` +
    (v.warnings.length ? ` (${v.warnings.length} warning(s))` : ""));
  if (check) return;

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL (or DATABASE_URL_UNPOOLED) is required");
  process.env.DATABASE_URL = url;
  try {
    const c = await seedDatabase(v.prompts);
    console.log(`seed: ${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged`);
  } finally {
    await closeDb();
  }
}

if (isMain("scripts/seed.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
