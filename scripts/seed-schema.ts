// Zod schemas + validation for seed content (ARCHITECTURE.md section 16). No DB access.
import { z } from "zod";
import { AI_MODELS, LICENSES, USE_CASES } from "../src/lib/constants";
import { normalizeTag } from "../src/lib/slug";
import { normalizeTemplate } from "../src/lib/template";
import { variableDefSchema } from "../src/lib/validation";
import type { VariableDef } from "../src/lib/types";

export const seedPromptSchema = z.object({
  key: z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "key must be kebab-case"),
  title: z.string().min(8).max(100),
  description: z.string().min(20).max(300),
  body: z.string().min(40).max(8000),
  variables: z.array(variableDefSchema).max(20).default([]),
  exampleOutput: z.string().min(1).max(6000),
  notes: z.string().max(2000).optional(),
  useCase: z.enum(USE_CASES),
  tags: z.array(z.string()).min(1).max(5),
  models: z.array(z.enum(AI_MODELS)).max(6).default([]),
  featured: z.boolean().default(false),
  license: z.enum(LICENSES).default("cc0"),
});

export const seedFileSchema = z.object({
  category: z.string().min(1),
  prompts: z.array(seedPromptSchema),
});

export const categoriesFileSchema = z.array(z.object({
  slug: z.string().min(1).max(48),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  icon: z.string().min(1).max(40),
  sortOrder: z.number().int(),
}));

export const tagsFileSchema = z.array(z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(2).max(32),
  name: z.string().min(1).max(32),
}));

export type SeedPrompt = z.infer<typeof seedPromptSchema>;
export type SeedFile = z.infer<typeof seedFileSchema>;

export interface NormalizedSeedPrompt {
  key: string;
  categorySlug: string;
  title: string;
  description: string;
  body: string;            // canonical {{key}} form
  variables: VariableDef[];
  exampleOutput: string;
  notes: string | null;
  useCase: SeedPrompt["useCase"];
  tags: string[];          // normalized slugs
  models: SeedPrompt["models"];
  featured: boolean;
  license: SeedPrompt["license"];
}

export interface ValidationResult {
  prompts: NormalizedSeedPrompt[];
  errors: string[];
  warnings: string[];
}

/** Validates parsed seed files. Errors fail the run; warnings (non-canonical tags) do not. */
export function validateSeedFiles(
  files: { name: string; data: unknown }[],
  categorySlugs: Set<string>,
  canonicalTags: Set<string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const prompts: NormalizedSeedPrompt[] = [];
  const seenKeys = new Map<string, string>();
  const warnedTags = new Set<string>();

  for (const f of files) {
    const parsed = seedFileSchema.safeParse(f.data);
    if (!parsed.success) {
      for (const i of parsed.error.issues) errors.push(`${f.name}: ${i.path.join(".") || "(root)"}: ${i.message}`);
      continue;
    }
    const { category, prompts: list } = parsed.data;
    if (!categorySlugs.has(category)) errors.push(`${f.name}: unknown category "${category}"`);
    for (const p of list) {
      const where = `${f.name} [${p.key}]`;
      if (!p.key.startsWith(`${category}-`)) errors.push(`${where}: key must start with "${category}-"`);
      const prev = seenKeys.get(p.key);
      if (prev) errors.push(`${where}: duplicate key (also in ${prev})`);
      seenKeys.set(p.key, f.name);

      const norm = normalizeTemplate(p.body, p.variables);
      for (const e of norm.errors) errors.push(`${where}: template ${e.kind}${e.key ? ` (${e.key})` : ""}: ${e.message}`);
      const declared = new Set(p.variables.map((v) => v.key));
      for (const v of norm.variables) {
        if (!declared.has(v.key)) errors.push(`${where}: body uses {{${v.key}}} but it is not declared in variables`);
      }

      const tagSlugs: string[] = [];
      for (const raw of p.tags) {
        const t = normalizeTag(raw);
        if (!t) { errors.push(`${where}: invalid tag "${raw}"`); continue; }
        if (!tagSlugs.includes(t)) tagSlugs.push(t);
        if (!canonicalTags.has(t) && !warnedTags.has(t)) {
          warnedTags.add(t);
          warnings.push(`${where}: tag "${t}" is not in content/tags.json`);
        }
      }

      prompts.push({
        key: p.key, categorySlug: category, title: p.title, description: p.description,
        body: norm.body, variables: norm.variables, exampleOutput: p.exampleOutput,
        notes: p.notes ?? null, useCase: p.useCase, tags: tagSlugs, models: p.models,
        featured: p.featured, license: p.license,
      });
    }
  }
  return { prompts, errors, warnings };
}
