import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { profileInputSchema, type ProfileInput } from "@/lib/validation";
import type { ProfilePage, TrustLevel, Viewer } from "@/lib/types";
import { accountAgeDays, getActiveActor, isUniqueViolation, parseInput } from "@/server/moderation/guards";

export { ensureProfile } from "@/db/profiles";

const TRUST_MIN_PUBLISHED = 2;
const TRUST_MIN_COMMENTS = 3;
const TRUST_MIN_AGE_DAYS = 7;

function toProfilePage(r: {
  userId: string; username: string; name: string; image: string | null; bio: string | null; website: string | null;
  trustLevel: number; createdAt: Date; publishedPromptCount: number; isSystem: boolean;
}): ProfilePage {
  return {
    userId: r.userId,
    username: r.username,
    name: r.name,
    image: r.image,
    bio: r.bio,
    website: r.website,
    trustLevel: r.trustLevel as TrustLevel,
    joinedAt: r.createdAt.toISOString(),
    publishedPromptCount: r.publishedPromptCount,
    isSystem: r.isSystem,
  };
}

const profileColumns = {
  userId: profiles.userId,
  username: profiles.username,
  name: user.name,
  image: user.image,
  bio: profiles.bio,
  website: profiles.website,
  trustLevel: profiles.trustLevel,
  createdAt: user.createdAt,
  publishedPromptCount: profiles.publishedPromptCount,
  isSystem: profiles.isSystem,
};

/** Case-insensitive lookup (the username column is citext). */
export async function getProfileByUsername(username: string): Promise<ProfilePage | null> {
  const name = username.trim();
  if (!name || name.length > 64) return null;
  const [row] = await db
    .select(profileColumns)
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.username, name))
    .limit(1);
  return row ? toProfilePage(row) : null;
}

export async function updateProfile(actor: Viewer, input: ProfileInput): Promise<ProfilePage> {
  const me = await getActiveActor(actor);
  const data = parseInput(profileInputSchema, input);
  const [taken] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.username, data.username))
    .limit(1);
  if (taken && taken.userId !== me.id) {
    throw new AppError("CONFLICT", "That username is taken", { username: ["That username is taken"] });
  }
  try {
    const updated = await db
      .update(profiles)
      .set({ username: data.username, bio: data.bio || null, website: data.website || null })
      .where(eq(profiles.userId, me.id))
      .returning({ userId: profiles.userId });
    if (updated.length === 0) throw new AppError("NOT_FOUND", "Profile not found");
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new AppError("CONFLICT", "That username is taken", { username: ["That username is taken"] });
    }
    throw e;
  }
  const page = await getProfileByUsername(data.username);
  if (!page) throw new AppError("NOT_FOUND", "Profile not found");
  return page;
}

/**
 * Section 10. Level 1: at least 2 published prompts, OR an account at least 7 days old with at least 3 visible
 * comments and no upheld (actioned) reports against the user, their prompts or their comments.
 * Levels 2 and 3 are set by an admin and never touched here; a level an admin set explicitly (a `set_trust`
 * audit row exists for the user) is respected too, so the nightly job never overrides a manual decision.
 */
export async function recomputeTrustLevel(userId: string): Promise<TrustLevel> {
  const [row] = await db
    .select({ trustLevel: profiles.trustLevel, createdAt: user.createdAt })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!row) throw new AppError("NOT_FOUND", "User not found");
  const current = row.trustLevel as TrustLevel;
  if (current >= 2) return current;

  const manual = await db.execute(sql`
    SELECT 1 FROM moderation_actions WHERE target_type = 'user' AND target_id = ${userId} AND action = 'set_trust' LIMIT 1`);
  if (manual.rows.length > 0) return current;

  const res = await db.execute<{ published: number; comments: number; upheld: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM prompts WHERE author_id = ${userId} AND status = 'published') AS published,
      (SELECT count(*)::int FROM comments WHERE author_id = ${userId} AND status = 'visible') AS comments,
      (SELECT count(*)::int FROM reports r WHERE r.status = 'actioned' AND (
          (r.target_type = 'user' AND r.target_id = ${userId})
          OR (r.target_type = 'prompt' AND r.target_id IN (SELECT id::text FROM prompts WHERE author_id = ${userId}))
          OR (r.target_type = 'comment' AND r.target_id IN (SELECT id::text FROM comments WHERE author_id = ${userId}))
      )) AS upheld`);
  const c = res.rows[0];
  const published = Number(c?.published ?? 0);
  const comments = Number(c?.comments ?? 0);
  const upheld = Number(c?.upheld ?? 0);
  const eligible =
    published >= TRUST_MIN_PUBLISHED ||
    (accountAgeDays(row.createdAt) >= TRUST_MIN_AGE_DAYS && comments >= TRUST_MIN_COMMENTS && upheld === 0);
  const level: TrustLevel = eligible ? 1 : 0;
  if (level !== current) {
    await db.update(profiles).set({ trustLevel: level }).where(eq(profiles.userId, userId));
  }
  return level;
}

/** Users with a prompt, comment, rating or approval in the last N days (default 2); returns how many changed. */
export async function recomputeActiveTrustLevels(sinceDays: number = 2): Promise<number> {
  const days = Number.isFinite(sinceDays) && sinceDays > 0 ? sinceDays : 2;
  const since = new Date(Date.now() - days * 86_400_000);
  const res = await db.execute<{ uid: string }>(sql`
    SELECT uid FROM (
      SELECT author_id AS uid FROM prompts
        WHERE created_at >= ${since} OR published_at >= ${since} OR reviewed_at >= ${since}
      UNION SELECT author_id FROM comments WHERE created_at >= ${since}
      UNION SELECT user_id FROM ratings WHERE created_at >= ${since} OR updated_at >= ${since}
    ) active
    WHERE uid IN (SELECT user_id FROM profiles)
    LIMIT 20000`);
  let changed = 0;
  for (const { uid } of res.rows) {
    try {
      const before = await db.select({ t: profiles.trustLevel }).from(profiles).where(eq(profiles.userId, uid)).limit(1);
      const after = await recomputeTrustLevel(uid);
      if (before[0] && before[0].t !== after) changed++;
    } catch (e) {
      console.error("[trust] recompute failed", e instanceof Error ? e.message : "unknown");
    }
  }
  return changed;
}
