import "server-only";
import { and, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import {
  categories, moderationActions, profiles, promptModels, promptTags, promptVersions, prompts, user,
} from "@/db/schema";
import { MAX_TEMPLATE_KEYS } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { buildPromptSlug, newShortId } from "@/lib/slug";
import { normalizeTemplate } from "@/lib/template";
import {
  promptInputSchema, promptUpdateInputSchema, variableDefSchema, type PromptInput, type PromptUpdateInput,
} from "@/lib/validation";
import type { PromptStatus, ScreeningResult, VariableDef, Viewer } from "@/lib/types";
import { recountPromptRelations } from "@/server/moderation/counters";
import { accountAgeDays, getActiveActor, parseInput } from "@/server/moderation/guards";
import { screenContent } from "@/server/moderation/screening";
import { enforceRateLimit } from "@/server/rate-limit";
import { resolveTags } from "./mutations-tags";

type ContentInput = PromptInput | PromptUpdateInput;

/** Order-insensitive JSON (jsonb does not preserve key order). */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Canonicalizes the body and merges inline variable specs; template problems become VALIDATION on `body`. */
function canonicalTemplate(input: ContentInput): { body: string; variables: VariableDef[] } {
  const n = normalizeTemplate(input.body, input.variables);
  if (n.errors.length > 0) {
    const messages = n.errors.map((e) => e.message);
    throw new AppError("VALIDATION", messages[0] ?? "The prompt template has errors", { body: messages });
  }
  const parsed = z.array(variableDefSchema).max(MAX_TEMPLATE_KEYS).safeParse(n.variables);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new AppError("VALIDATION", "Some variables are invalid", { variables: messages });
  }
  return { body: n.body, variables: parsed.data as VariableDef[] };
}

function rejectionError(verdict: ScreeningResult): AppError {
  const reasons = verdict.reasons.length ? verdict.reasons : ["This content can't be posted"];
  return new AppError("VALIDATION", reasons.join(" "), { _root: reasons });
}

async function findCategoryId(tx: Tx | typeof db, slug: string): Promise<string> {
  const [c] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug)).limit(1);
  if (!c) throw new AppError("VALIDATION", "Choose a valid category", { categorySlug: ["Choose a valid category"] });
  return c.id;
}

function screeningText(input: ContentInput, body: string) {
  return {
    title: input.title,
    text: body,
    extraText: [input.description, input.notes, input.exampleOutput].filter(Boolean).join("\n\n"),
  };
}

/**
 * Section 7 status logic: validate, normalize the template, screen, then insert prompt + version 1 + tags +
 * models in one transaction, recount category/tag/author counters and bump the parent's fork_count for forks.
 * Rejected content is never stored. Review verdicts and trust level 0 give `pending`; otherwise `published`.
 */
export async function createPrompt(
  actor: Viewer,
  input: PromptInput,
): Promise<{ id: string; shortId: string; slug: string; status: PromptStatus }> {
  const me = await getActiveActor(actor);
  const data = parseInput(promptInputSchema, input);
  await enforceRateLimit("prompt_create", { userId: me.id, trustLevel: me.trustLevel });
  const tpl = canonicalTemplate(data);
  const categoryId = await findCategoryId(db, data.categorySlug);

  let parent: { id: string; version: number } | null = null;
  if (data.forkedFromShortId) {
    const [p] = await db.select({ id: prompts.id, version: prompts.version }).from(prompts)
      .where(and(eq(prompts.shortId, data.forkedFromShortId), eq(prompts.status, "published"))).limit(1);
    if (!p) throw new AppError("NOT_FOUND", "The prompt you are forking was not found");
    parent = p;
  }

  const verdict = await screenContent({
    kind: "prompt", ...screeningText(data, tpl.body),
    author: { trustLevel: me.trustLevel, accountAgeDays: me.accountAgeDays },
    excludePromptId: parent?.id,
  });
  if (verdict.verdict === "reject") throw rejectionError(verdict);
  const status: PromptStatus = verdict.verdict === "review" || me.trustLevel === 0 ? "pending" : "published";
  const now = new Date();

  return db.transaction(async (tx) => {
    if (parent) {
      const [locked] = await tx.select({ id: prompts.id, version: prompts.version, status: prompts.status }).from(prompts)
        .where(eq(prompts.id, parent.id)).for("update").limit(1);
      if (!locked || locked.status !== "published") throw new AppError("NOT_FOUND", "The prompt you are forking was not found");
      parent = { id: locked.id, version: locked.version };
    }
    const tagRows = await resolveTags(tx, data.tags);

    let shortId = newShortId();
    for (let i = 0; i < 5; i++) {
      const [taken] = await tx.select({ id: prompts.id }).from(prompts).where(eq(prompts.shortId, shortId)).limit(1);
      if (!taken) break;
      shortId = newShortId();
    }
    const slug = buildPromptSlug(data.title, shortId);

    const [row] = await tx.insert(prompts).values({
      shortId, slug, authorId: me.id, title: data.title, description: data.description, body: tpl.body,
      variables: tpl.variables, exampleOutput: data.exampleOutput ?? null, notes: data.notes ?? null,
      categoryId, useCase: data.useCase, license: data.license, status, version: 1,
      forkedFromId: parent?.id ?? null, forkedFromVersion: parent?.version ?? null,
      tagsText: tagRows.map((t) => t.name).join(" "),
      moderationFlags: verdict.flags, duplicateOfId: verdict.duplicateOfId ?? null,
      publishedAt: status === "published" ? now : null,
    }).returning({ id: prompts.id });
    const id = row!.id;

    await tx.insert(promptVersions).values({
      promptId: id, version: 1, title: data.title, description: data.description, body: tpl.body,
      variables: tpl.variables, exampleOutput: data.exampleOutput ?? null, notes: data.notes ?? null, editorId: me.id,
    });
    if (tagRows.length) await tx.insert(promptTags).values(tagRows.map((t) => ({ promptId: id, tagId: t.id })));
    const models = [...new Set(data.models)];
    if (models.length) await tx.insert(promptModels).values(models.map((model) => ({ promptId: id, model })));

    await recountPromptRelations(tx, { promptId: id, categoryIds: [categoryId], authorId: me.id, forkedFromId: parent?.id });
    return { id, shortId, slug, status };
  });
}

/**
 * Author or admin. A material change (title, description, body, variables) creates version N+1; a title change
 * rewrites the slug (the old slug still resolves through the shortId). A published prompt whose trust-0 author
 * edits it into a `review` verdict goes back to `pending`. A `rejected` prompt edited by its author is resubmitted
 * (pending, or published for trusted authors with a clean verdict). Admin edits are not screened.
 */
export async function updatePrompt(
  actor: Viewer,
  promptId: string,
  input: PromptUpdateInput,
): Promise<{ slug: string; version: number; status: PromptStatus }> {
  const me = await getActiveActor(actor);
  const id = parseInput(z.uuid(), promptId);
  const data = parseInput(promptUpdateInputSchema, input);

  const [current] = await db.select({
    id: prompts.id, authorId: prompts.authorId, status: prompts.status,
    authorTrust: profiles.trustLevel, authorCreatedAt: user.createdAt,
  }).from(prompts)
    .innerJoin(user, eq(user.id, prompts.authorId))
    .leftJoin(profiles, eq(profiles.userId, prompts.authorId))
    .where(eq(prompts.id, id)).limit(1);
  if (!current || current.status === "removed") throw new AppError("NOT_FOUND", "Prompt not found");
  const isAuthor = current.authorId === me.id;
  if (!isAuthor && me.role !== "admin") throw new AppError("FORBIDDEN", "You can't edit this prompt");

  await enforceRateLimit("prompt_update", { userId: me.id, trustLevel: me.trustLevel });
  const tpl = canonicalTemplate(data);
  const newCategoryId = await findCategoryId(db, data.categorySlug);

  const authorTrust = (current.authorTrust ?? 0) as 0 | 1 | 2 | 3;
  let verdict: ScreeningResult | null = null;
  if (me.role !== "admin") {
    verdict = await screenContent({
      kind: "prompt", ...screeningText(data, tpl.body),
      author: { trustLevel: authorTrust, accountAgeDays: accountAgeDays(current.authorCreatedAt) },
      excludePromptId: id,
    });
    if (verdict.verdict === "reject") throw rejectionError(verdict);
  }

  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(prompts).where(eq(prompts.id, id)).for("update").limit(1);
    if (!p || p.status === "removed") throw new AppError("NOT_FOUND", "Prompt not found");

    const tagRows = await resolveTags(tx, data.tags);
    const oldTagRows = await tx.select({ tagId: promptTags.tagId }).from(promptTags).where(eq(promptTags.promptId, id));

    const material =
      p.title !== data.title || p.description !== data.description || p.body !== tpl.body ||
      stableJson(p.variables) !== stableJson(tpl.variables);
    const version = material ? p.version + 1 : p.version;
    const slug = p.title !== data.title ? buildPromptSlug(data.title, p.shortId) : p.slug;

    let status: PromptStatus = p.status;
    let publishedAt = p.publishedAt;
    if (verdict && isAuthor) {
      if (p.status === "published" && verdict.verdict === "review" && authorTrust === 0) status = "pending";
      else if (p.status === "rejected") status = verdict.verdict === "review" || authorTrust === 0 ? "pending" : "published";
    }
    if (status === "published" && !publishedAt) publishedAt = new Date();

    if (material) {
      await tx.insert(promptVersions).values({
        promptId: id, version, title: data.title, description: data.description, body: tpl.body,
        variables: tpl.variables, exampleOutput: data.exampleOutput ?? null, notes: data.notes ?? null,
        changeNote: data.changeNote || null, editorId: me.id,
      });
    }

    await tx.update(prompts).set({
      title: data.title, slug, description: data.description, body: tpl.body, variables: tpl.variables,
      exampleOutput: data.exampleOutput ?? null, notes: data.notes ?? null, categoryId: newCategoryId,
      useCase: data.useCase, license: data.license, version, status, publishedAt,
      tagsText: tagRows.map((t) => t.name).join(" "),
      ...(verdict ? { moderationFlags: verdict.flags, duplicateOfId: verdict.duplicateOfId ?? null } : {}),
      ...(status !== p.status && status === "pending" ? { moderationNote: null } : {}),
    }).where(eq(prompts.id, id));

    await tx.delete(promptTags).where(eq(promptTags.promptId, id));
    if (tagRows.length) await tx.insert(promptTags).values(tagRows.map((t) => ({ promptId: id, tagId: t.id })));

    const models = [...new Set(data.models)];
    if (models.length) {
      await tx.delete(promptModels).where(and(eq(promptModels.promptId, id), notInArray(promptModels.model, models)));
      await tx.insert(promptModels).values(models.map((model) => ({ promptId: id, model }))).onConflictDoNothing();
    } else {
      await tx.delete(promptModels).where(eq(promptModels.promptId, id));
    }

    await recountPromptRelations(tx, {
      promptId: id, categoryIds: [p.categoryId, newCategoryId], authorId: p.authorId, forkedFromId: p.forkedFromId,
      extraTagIds: oldTagRows.map((r) => r.tagId),
    });
    return { slug, version, status };
  });
}

/** Author or admin: soft delete (status `removed`, removed_at set). Idempotent. Admin deletes are audited. */
export async function deletePrompt(actor: Viewer, promptId: string): Promise<void> {
  const me = await getActiveActor(actor);
  const id = parseInput(z.uuid(), promptId);

  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(prompts).where(eq(prompts.id, id)).for("update").limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Prompt not found");
    if (p.authorId !== me.id && me.role !== "admin") throw new AppError("FORBIDDEN", "You can't delete this prompt");
    if (p.status === "removed") return;
    await tx.update(prompts).set({ status: "removed", removedAt: new Date(), isFeatured: false }).where(eq(prompts.id, id));
    await recountPromptRelations(tx, {
      promptId: id, categoryIds: [p.categoryId], authorId: p.authorId, forkedFromId: p.forkedFromId,
    });
    if (p.authorId !== me.id) {
      await tx.insert(moderationActions).values({
        actorId: me.id, targetType: "prompt", targetId: id, action: "remove", reason: null,
        metadata: { from: p.status, via: "deletePrompt" },
      });
    }
  });
}
