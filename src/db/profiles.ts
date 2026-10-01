// Import-graph rule (README): CLI safe. Used by Better Auth hooks, seed scripts and the Better Auth CLI import graph.
import { db } from "./index";
import { profiles } from "./schema";
import { generateUsername } from "../lib/slug";

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 3 && cur; i++) {
    if (typeof cur === "object" && (cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Idempotent: creates the profile row for a user if missing. Retries on username collisions (max 5). */
export async function ensureProfile(u: { id: string; name: string; email: string }): Promise<void> {
  const seed = u.name?.trim() || u.email.split("@")[0] || "user";
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(profiles).values({ userId: u.id, username: generateUsername(seed) })
        .onConflictDoNothing({ target: profiles.userId });
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
