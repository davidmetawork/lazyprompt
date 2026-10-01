import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { profileInputSchema, type ProfileInput } from "@/lib/validation";
import type { ProfilePage, TrustLevel, Viewer } from "@/lib/types";
import { accountAgeDays, getActiveActor, isUniqueViolation, parseInput } from "@/server/moderation/guards";
import { runHeuristics } from "@/server/moderation/screening";
import { enforceRateLimit } from "@/server/rate-limit";

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

/**
 * The bio and website are public, followable text, so they get the same heuristics as comments. A reject verdict (link
 * shortener) always fails. Any other flag (links, contact details, jailbreak or SEO spam wording) is not allowed for
 * trust 0 accounts yet: there is no profile review queue, so they can add such details once their account is established.
 */
function screenProfileText(me: { trustLevel: TrustLevel; accountAgeDays: number }, data: { bio?: string; website?: string }): void {
  const text = [data.bio, data.website].filter(Boolean).join(" ");
  if (!text) return;
  const verdict = runHeuristics({ kind: "comment", text, author: { trustLevel: me.trustLevel, accountAgeDays: me.accountAgeDays } });
  if (verdict.verdict === "reject" || (verdict.verdict === "review" && me.trustLevel === 0)) {
    const reasons = verdict.reasons.length ? verdict.reasons : ["This can't be added to a profile"];
    const hint = verdict.verdict === "review" ? ["New accounts can't add links or contact details to their profile yet."] : [];
    const messages = [...reasons, ...hint];
    throw new AppError("VALIDATION", messages.join(" "), { [data.bio ? "bio" : "website"]: messages });
  }
}

export async function updateProfile(actor: Viewer, input: ProfileInput): Promise<ProfilePage> {
  const me = await getActiveActor(actor);
  const data = parseInput(profileInputSchema, input);
  await enforceRateLimit("profile", { userId: me.id, trustLevel: me.trustLevel });
  screenProfileText(me, data);
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

/**
 * Users with a prompt, comment, rating or approval in the last N days (default 2); returns how many changed.
 * One set-based UPDATE (same rules as recomputeTrustLevel: levels 2+ and admin-set levels are left alone) instead of
 * several queries per user.
 */
export async function recomputeActiveTrustLevels(sinceDays: number = 2): Promise<number> {
  const days = Number.isFinite(sinceDays) && sinceDays > 0 ? sinceDays : 2;
  const since = new Date(Date.now() - days * 86_400_000);
  const res = await db.execute<{ user_id: string }>(sql`
    WITH active AS (
      SELECT uid FROM (
        SELECT author_id AS uid FROM prompts
          WHERE created_at >= ${since} OR published_at >= ${since} OR reviewed_at >= ${since}
        UNION SELECT author_id FROM comments WHERE created_at >= ${since}
        UNION SELECT user_id FROM ratings WHERE created_at >= ${since} OR updated_at >= ${since}
      ) a
      LIMIT 20000
    ),
    cand AS (
      SELECT pr.user_id, pr.trust_level AS cur,
             (c.published >= ${TRUST_MIN_PUBLISHED} OR (
                u.created_at <= now() - make_interval(days => ${TRUST_MIN_AGE_DAYS})
                AND c.comments >= ${TRUST_MIN_COMMENTS} AND c.upheld = 0)) AS eligible
      FROM active a
      JOIN profiles pr ON pr.user_id = a.uid
      JOIN "user" u ON u.id = pr.user_id
      CROSS JOIN LATERAL (SELECT
        (SELECT count(*)::int FROM prompts WHERE author_id = pr.user_id AND status = 'published') AS published,
        (SELECT count(*)::int FROM comments WHERE author_id = pr.user_id AND status = 'visible') AS comments,
        (SELECT count(*)::int FROM reports r WHERE r.status = 'actioned' AND (
            (r.target_type = 'user' AND r.target_id = pr.user_id)
            OR (r.target_type = 'prompt' AND r.target_id IN (SELECT id::text FROM prompts WHERE author_id = pr.user_id))
            OR (r.target_type = 'comment' AND r.target_id IN (SELECT id::text FROM comments WHERE author_id = pr.user_id))
        )) AS upheld) c
      WHERE pr.trust_level < 2
        AND NOT EXISTS (SELECT 1 FROM moderation_actions m
                        WHERE m.target_type = 'user' AND m.target_id = pr.user_id AND m.action = 'set_trust')
    )
    UPDATE profiles SET trust_level = CASE WHEN cand.eligible THEN 1 ELSE 0 END
    FROM cand
    WHERE profiles.user_id = cand.user_id AND profiles.trust_level <> CASE WHEN cand.eligible THEN 1 ELSE 0 END
    RETURNING profiles.user_id`);
  return res.rows.length;
}
