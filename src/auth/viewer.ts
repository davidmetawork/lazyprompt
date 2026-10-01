import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./server";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { ensureProfile } from "@/db/profiles";
import { AppError } from "@/lib/errors";
import { safeNext } from "@/lib/validation";
import type { TrustLevel, Viewer } from "@/lib/types";

async function loadViewer(userId: string): Promise<Viewer | null> {
  const query = () => db
    .select({
      id: user.id, name: user.name, email: user.email, image: user.image, role: user.role,
      banned: user.banned, banExpires: user.banExpires, createdAt: user.createdAt,
      username: profiles.username, trustLevel: profiles.trustLevel,
    })
    .from(user)
    .leftJoin(profiles, eq(profiles.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  let [row] = await query();
  if (!row) return null;
  if (!row.username) {
    // Profile hook has not run (or failed): create it lazily, then re-read.
    await ensureProfile({ id: row.id, name: row.name, email: row.email });
    [row] = await query();
    if (!row || !row.username) return null;
  }
  const banActive = Boolean(row.banned) && (!row.banExpires || row.banExpires.getTime() > Date.now());
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    username: row.username,
    role: row.role === "admin" ? "admin" : "user",
    trustLevel: (row.trustLevel ?? 0) as TrustLevel,
    createdAt: row.createdAt.toISOString(),
    banned: banActive,
  };
}

/** Used by MCP after token verification. role/banned come from the DB, never from a token or cookie. */
export async function getViewerById(userId: string): Promise<Viewer | null> {
  return loadViewer(userId);
}

/** Per-request cached. getSession, then ONE DB query joining user + profiles (role and banned come from the DB row). */
export const getViewer: () => Promise<Viewer | null> = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  return loadViewer(session.user.id);
});

// --- for PAGES / layouts (navigation side effects are fine here) ---
export async function requireViewer(next?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/sign-in?next=${encodeURIComponent(safeNext(next))}`);
  if (v.banned) redirect("/suspended");
  return v;
}

export async function requireAdmin(): Promise<Viewer> {
  const v = await getViewer();
  if (!v || v.banned || v.role !== "admin") notFound();
  return v;
}

// --- for SERVER ACTIONS and route handlers (never navigate; safe inside toActionResult) ---
export async function requireViewerForAction(): Promise<Viewer> {
  const v = await getViewer();
  if (!v) throw new AppError("UNAUTHENTICATED", "Please sign in");
  if (v.banned) throw new AppError("BANNED", "Your account has been suspended");
  return v;
}

export async function requireAdminForAction(): Promise<Viewer> {
  const v = await requireViewerForAction();
  if (v.role !== "admin") throw new AppError("FORBIDDEN", "Not allowed");
  return v;
}
