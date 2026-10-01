import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { comments, moderationActions, profiles, prompts, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { commentInputSchema, type CommentInput } from "@/lib/validation";
import type { CommentNode, Viewer } from "@/lib/types";
import { recountPromptComments } from "@/server/moderation/counters";
import { getActiveActor, parseInput, type ActiveActor } from "@/server/moderation/guards";
import { screenContent } from "@/server/moderation/screening";
import { enforceRateLimit } from "@/server/rate-limit";

export const COMMENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const uuidSchema = z.uuid();
const REMOVED_PLACEHOLDER = "[removed]";

const commentColumns = {
  id: comments.id,
  promptId: comments.promptId,
  authorId: comments.authorId,
  parentId: comments.parentId,
  body: comments.body,
  status: comments.status,
  createdAt: comments.createdAt,
  editedAt: comments.editedAt,
  authorName: user.name,
  authorImage: user.image,
  authorUsername: profiles.username,
  authorIsSystem: profiles.isSystem,
};

type CommentRow = {
  id: string; promptId: string; authorId: string; parentId: string | null; body: string; status: CommentNode["status"];
  createdAt: Date; editedAt: Date | null; authorName: string; authorImage: string | null;
  authorUsername: string | null; authorIsSystem: boolean | null;
};

function toNode(r: CommentRow, viewerId: string | null, body: string = r.body): CommentNode {
  return {
    id: r.id,
    body,
    status: r.status,
    author: {
      id: r.authorId, username: r.authorUsername ?? "", name: r.authorName, image: r.authorImage,
      isSystem: r.authorIsSystem ?? false,
    },
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    isOwn: viewerId !== null && r.authorId === viewerId,
    replies: [],
  };
}

async function loadRow(tx: Tx | typeof db, id: string): Promise<CommentRow | null> {
  const [row] = await tx
    .select(commentColumns)
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(comments.id, id))
    .limit(1);
  return (row as CommentRow | undefined) ?? null;
}

/**
 * Threaded comments for a prompt: visible ones, the viewer's own pending ones (status "pending", isOwn true) and
 * everything for admins. A removed/hidden top-level comment that still has listed replies stays as a "[removed]"
 * placeholder so those replies keep their context. Oldest first.
 */
export async function listComments(promptId: string, viewer: Viewer | null): Promise<CommentNode[]> {
  if (!/^[0-9a-f-]{36}$/i.test(promptId)) return [];
  const rows = (await db
    .select(commentColumns)
    .from(comments)
    .innerJoin(user, eq(user.id, comments.authorId))
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(comments.promptId, promptId))
    .orderBy(asc(comments.createdAt), asc(comments.id))) as CommentRow[];

  const isAdmin = viewer?.role === "admin";
  const viewerId = viewer?.id ?? null;
  const canSee = (r: CommentRow) =>
    isAdmin || r.status === "visible" || (r.status === "pending" && viewerId !== null && r.authorId === viewerId);

  const nodes = new Map<string, CommentNode>();
  for (const r of rows) if (canSee(r)) nodes.set(r.id, toNode(r, viewerId));

  const top: CommentNode[] = [];
  const topRows = new Map(rows.filter((r) => r.parentId === null).map((r) => [r.id, r]));
  for (const r of rows) {
    const node = nodes.get(r.id);
    if (!node) continue;
    if (r.parentId === null) top.push(node);
    else {
      let parent = nodes.get(r.parentId);
      if (!parent) {
        const pr = topRows.get(r.parentId);
        if (!pr) continue;
        // Hidden/removed/pending-by-someone-else parent: keep a redacted placeholder for the thread.
        parent = toNode(pr, viewerId, REMOVED_PLACEHOLDER);
        nodes.set(pr.id, parent);
        top.push(parent);
      }
      parent.replies.push(node);
    }
  }
  // Placeholders were appended out of order; restore chronological order of top-level comments.
  const order = new Map(rows.map((r, i) => [r.id, i]));
  top.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return top;
}

function screenInput(me: ActiveActor, body: string) {
  return { kind: "comment" as const, text: body, author: { trustLevel: me.trustLevel, accountAgeDays: me.accountAgeDays } };
}

export async function createComment(actor: Viewer, input: CommentInput): Promise<CommentNode> {
  const me = await getActiveActor(actor);
  const data = parseInput(commentInputSchema, input);
  await enforceRateLimit("comment", { userId: me.id, trustLevel: me.trustLevel });

  const verdict = await screenContent(screenInput(me, data.body));
  if (verdict.verdict === "reject") {
    throw new AppError("VALIDATION", verdict.reasons.join(" "), { body: verdict.reasons });
  }
  const status = verdict.verdict === "review" ? "pending" : "visible";

  const id = await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: prompts.id, status: prompts.status }).from(prompts)
      .where(eq(prompts.id, data.promptId)).for("update").limit(1);
    if (!p || p.status !== "published") throw new AppError("NOT_FOUND", "Prompt not found");

    let depth = 0;
    if (data.parentId) {
      const [parent] = await tx.select({
        id: comments.id, promptId: comments.promptId, depth: comments.depth, status: comments.status,
      }).from(comments).where(eq(comments.id, data.parentId)).limit(1);
      if (!parent || parent.promptId !== p.id) {
        throw new AppError("VALIDATION", "The comment you are replying to was not found on this prompt", {
          parentId: ["The comment you are replying to was not found on this prompt"],
        });
      }
      if (parent.depth !== 0) {
        throw new AppError("VALIDATION", "Replies can only go one level deep", { parentId: ["Replies can only go one level deep"] });
      }
      if (parent.status !== "visible") {
        throw new AppError("VALIDATION", "You can't reply to this comment", { parentId: ["You can't reply to this comment"] });
      }
      depth = 1;
    }

    const [row] = await tx.insert(comments).values({
      promptId: p.id, authorId: me.id, parentId: data.parentId ?? null, depth, body: data.body, status,
      moderationFlags: verdict.flags,
    }).returning({ id: comments.id });
    await recountPromptComments(tx, p.id);
    return row!.id;
  });

  const row = await loadRow(db, id);
  if (!row) throw new AppError("NOT_FOUND", "Comment not found");
  return toNode(row, me.id);
}

/** Author only, within 24 hours of creation. The new text is screened again (a review verdict makes it pending). */
export async function updateComment(actor: Viewer, commentId: string, body: string): Promise<CommentNode> {
  const me = await getActiveActor(actor);
  const text = parseInput(commentInputSchema.shape.body, body);
  const idCheck = parseInput(uuidSchema, commentId);

  const existing = await loadRow(db, idCheck);
  if (!existing) throw new AppError("NOT_FOUND", "Comment not found");
  if (existing.authorId !== me.id) throw new AppError("FORBIDDEN", "You can only edit your own comments");
  if (existing.status === "removed" || existing.status === "hidden") {
    throw new AppError("FORBIDDEN", "This comment can no longer be edited");
  }
  if (Date.now() - existing.createdAt.getTime() > COMMENT_EDIT_WINDOW_MS) {
    throw new AppError("FORBIDDEN", "Comments can only be edited within 24 hours");
  }

  const verdict = await screenContent(screenInput(me, text));
  if (verdict.verdict === "reject") {
    throw new AppError("VALIDATION", verdict.reasons.join(" "), { body: verdict.reasons });
  }
  const status = verdict.verdict === "review" ? "pending" : "visible";

  await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, existing.promptId)).for("update").limit(1);
    const [cur] = await tx.select({ status: comments.status }).from(comments).where(eq(comments.id, idCheck)).for("update").limit(1);
    if (!p || !cur || cur.status === "removed" || cur.status === "hidden") {
      throw new AppError("FORBIDDEN", "This comment can no longer be edited");
    }
    await tx.update(comments)
      .set({ body: text, status, moderationFlags: verdict.flags, editedAt: new Date() })
      .where(eq(comments.id, idCheck));
    await recountPromptComments(tx, p.id);
  });

  const row = await loadRow(db, idCheck);
  if (!row) throw new AppError("NOT_FOUND", "Comment not found");
  return toNode(row, me.id);
}

/** Author or admin. Sets status "removed"; the body is kept for audit. Idempotent. */
export async function deleteComment(actor: Viewer, commentId: string): Promise<void> {
  const me = await getActiveActor(actor);
  const id = parseInput(uuidSchema, commentId);

  await db.transaction(async (tx) => {
    const [c] = await tx.select({
      id: comments.id, promptId: comments.promptId, authorId: comments.authorId, status: comments.status,
    }).from(comments).where(eq(comments.id, id)).limit(1);
    if (!c) throw new AppError("NOT_FOUND", "Comment not found");
    if (c.authorId !== me.id && me.role !== "admin") throw new AppError("FORBIDDEN", "You can't delete this comment");
    await tx.select({ id: prompts.id }).from(prompts).where(eq(prompts.id, c.promptId)).for("update");
    if (c.status === "removed") return;
    await tx.update(comments).set({ status: "removed" }).where(and(eq(comments.id, id), inArray(comments.status, ["visible", "pending", "hidden"])));
    await recountPromptComments(tx, c.promptId);
    if (c.authorId !== me.id) {
      await tx.insert(moderationActions).values({
        actorId: me.id, targetType: "comment", targetId: id, action: "remove", reason: null, metadata: { from: c.status, via: "deleteComment" },
      });
    }
  });
}
