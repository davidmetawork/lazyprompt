// Shared authorization / validation helpers for the write layer (private to src/server write modules).
import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { TrustLevel, Viewer } from "@/lib/types";

export interface ActiveActor {
  id: string;
  role: "user" | "admin";
  trustLevel: TrustLevel;
  accountAgeDays: number;
  createdAt: Date;
}

const DAY_MS = 86_400_000;

export function accountAgeDays(createdAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS));
}

/** zod issues -> { "path.to.field": [messages] }; root-level issues land under "_root". */
export function fieldErrorsFromZod(e: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of e.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "_root";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Re-validates input with a shared zod schema; failures become AppError VALIDATION with fieldErrors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new AppError("VALIDATION", "Please check the highlighted fields", fieldErrorsFromZod(r.error));
  }
  return r.data;
}

export function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Loads the authoritative state of a writing user from the database (the Viewer passed in may be stale):
 * banned users get BANNED, unknown users UNAUTHENTICATED. Role and trust level come from the DB row.
 */
export async function getActiveActor(actor: Viewer): Promise<ActiveActor> {
  if (!actor?.id) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
  if (actor.banned) throw new AppError("BANNED", "This account has been suspended");
  const [row] = await db
    .select({
      banned: user.banned, banExpires: user.banExpires, role: user.role, createdAt: user.createdAt,
      trustLevel: profiles.trustLevel,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, actor.id))
    .limit(1);
  if (!row) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
  if (row.banned && (!row.banExpires || row.banExpires.getTime() > Date.now())) {
    throw new AppError("BANNED", "This account has been suspended");
  }
  return {
    id: actor.id,
    role: row.role === "admin" ? "admin" : "user",
    trustLevel: ((row.trustLevel ?? 0) as TrustLevel),
    accountAgeDays: accountAgeDays(row.createdAt),
    createdAt: row.createdAt,
  };
}

/** Synchronous gate used by every admin read. */
export function assertAdmin(viewer: Viewer | null | undefined): asserts viewer is Viewer {
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Sign in to continue");
  if (viewer.role !== "admin") throw new AppError("FORBIDDEN", "Admins only");
}

/** Admin gate for actions: the viewer must claim admin AND still be an active admin in the database. */
export async function requireActiveAdmin(admin: Viewer): Promise<ActiveActor> {
  assertAdmin(admin);
  const fresh = await getActiveActor(admin);
  if (fresh.role !== "admin") throw new AppError("FORBIDDEN", "Admins only");
  return fresh;
}
