// Ranking recompute (ARCHITECTURE.md section 4): trending, global mean, bayes scores, maintenance deletions.
import "server-only";
import { sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db";
import { RANKING } from "./score";

const FRESH_MS = 10 * 60 * 1000;
const ADVISORY_LOCK_KEY = 4242;
const W = RANKING.WEIGHTS;

type Executor = Pick<Db | Tx, "execute">;

/**
 * One statement. `ev` unions usage events (minus zero-weight `not_worked`, which must not count towards MIN_ACTORS), saves,
 * ratings >= 4 and visible comments in the 7-day window as (prompt, actor, weight, time); distinct actor =
 * coalesce(user_id, actor_hash) for events, user id for the rest. Prompts with fewer than MIN_ACTORS distinct actors
 * score 0. The global mean is the weighted mean over published prompts' ratings (4.0 below 50 ratings); every bayes
 * score uses it. Prompts whose denormalized weight sums are unset (rating_weight_sum = 0) fall back to
 * rating_sum / rating_count with weight 1. Only rows whose scores actually change are rewritten (an unconditional UPDATE
 * dirties every published row and all of its indexes on each run), and `prompts` is that count.
 */
async function runRecompute(exec: Executor): Promise<{ prompts: number; globalMean: number }> {
  const res = await exec.execute<{ prompts: number; mean: number }>(sql`
    WITH rated AS (
      SELECT p.id,
             CASE WHEN p.rating_weight_sum > 0 THEN p.rating_weight_sum::float8 ELSE p.rating_count::float8 END AS w,
             CASE WHEN p.rating_weight_sum > 0 THEN p.rating_weighted_sum::float8 ELSE p.rating_sum::float8 END AS ws,
             p.rating_count
      FROM prompts p WHERE p.status = 'published'
    ),
    gm AS (
      SELECT CASE WHEN coalesce(sum(rating_count), 0) >= ${RANKING.MIN_RATINGS_FOR_MEAN} AND coalesce(sum(w), 0) > 0
                  THEN sum(ws) / sum(w) ELSE ${RANKING.DEFAULT_MEAN}::float8 END AS m
      FROM rated
    ),
    ev AS (
      SELECT e.prompt_id, coalesce(e.user_id, e.actor_hash) AS actor, e.created_at AS at,
             (CASE e.type WHEN 'copy' THEN ${W.copy} WHEN 'render' THEN ${W.render} WHEN 'open' THEN ${W.open}
                          WHEN 'worked' THEN ${W.worked} ELSE 0 END)::float8 AS weight
      FROM usage_events e
      WHERE e.type <> 'not_worked' AND e.created_at >= now() - make_interval(days => ${RANKING.WINDOW_DAYS})
      UNION ALL
      SELECT s.prompt_id, s.user_id, s.created_at, ${W.save}::float8
      FROM saves s WHERE s.created_at >= now() - make_interval(days => ${RANKING.WINDOW_DAYS})
      UNION ALL
      SELECT r.prompt_id, r.user_id, r.updated_at, ${W.rating}::float8
      FROM ratings r WHERE r.stars >= 4 AND r.updated_at >= now() - make_interval(days => ${RANKING.WINDOW_DAYS})
      UNION ALL
      SELECT c.prompt_id, c.author_id, c.created_at, ${W.comment}::float8
      FROM comments c WHERE c.status = 'visible' AND c.created_at >= now() - make_interval(days => ${RANKING.WINDOW_DAYS})
    ),
    agg AS (
      SELECT prompt_id, count(DISTINCT actor) AS actors,
             sum(weight * power(0.5, greatest(extract(epoch FROM (now() - at)) / 3600.0, 0) / ${RANKING.HALF_LIFE_HOURS})) AS score
      FROM ev GROUP BY prompt_id
    ),
    calc AS (
      SELECT r.id,
             coalesce((SELECT CASE WHEN a.actors >= ${RANKING.MIN_ACTORS} THEN a.score ELSE 0 END
                       FROM agg a WHERE a.prompt_id = r.id), 0)::float8 AS trending,
             ((${RANKING.C}::float8 * (SELECT m FROM gm) + r.ws) / (${RANKING.C}::float8 + r.w))::float8 AS bayes
      FROM rated r
    ),
    upd AS (
      UPDATE prompts p SET trending_score = c.trending, bayes_score = c.bayes
      FROM calc c
      WHERE c.id = p.id AND (p.trending_score, p.bayes_score) IS DISTINCT FROM (c.trending, c.bayes)
      RETURNING p.id
    ),
    s_mean AS (
      INSERT INTO app_settings (key, value, updated_at)
      SELECT 'ranking.globalMean', to_jsonb(m), now() FROM gm
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    ),
    s_at AS (
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('ranking.computedAt', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')), now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    )
    SELECT (SELECT count(*) FROM upd)::int AS prompts, (SELECT m FROM gm) AS mean
  `);
  const row = res.rows[0];
  return { prompts: Number(row?.prompts ?? 0), globalMean: Number(row?.mean ?? RANKING.DEFAULT_MEAN) };
}

export async function recomputeRankings(): Promise<{ prompts: number; globalMean: number }> {
  return runRecompute(db);
}

async function isFresh(exec: Executor): Promise<boolean> {
  const res = await exec.execute<{ value: unknown }>(sql`SELECT value FROM app_settings WHERE key = 'ranking.computedAt'`);
  const v = res.rows[0]?.value;
  const at = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(at) && Date.now() - at < FRESH_MS;
}

/**
 * Opportunistic recompute from page renders: no-op when `ranking.computedAt` is under 10 minutes old; otherwise one
 * caller wins `pg_try_advisory_xact_lock(4242)` and recomputes, the rest return immediately. Never throws.
 */
export async function maybeRecomputeRankings(): Promise<void> {
  try {
    if (await isFresh(db)) return;
    await db.transaction(async (tx) => {
      const lock = await tx.execute<{ ok: boolean }>(sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_KEY}) AS ok`);
      if (!lock.rows[0]?.ok) return;
      if (await isFresh(tx)) return;   // another request finished between our check and the lock
      await runRecompute(tx);
    });
  } catch (e) {
    console.error("[ranking] maybeRecomputeRankings failed", e instanceof Error ? e.message : e);
  }
}

/** Deletions only: usage events older than 90 days, rate-limit rows older than 2 days. */
export async function runMaintenance(): Promise<{ eventsDeleted: number; limitsDeleted: number }> {
  const res = await db.execute<{ events: number; limits: number }>(sql`
    WITH e AS (DELETE FROM usage_events WHERE created_at < now() - interval '90 days' RETURNING 1),
         l AS (DELETE FROM app_rate_limits WHERE window_start < now() - interval '2 days' RETURNING 1)
    SELECT (SELECT count(*) FROM e)::int AS events, (SELECT count(*) FROM l)::int AS limits
  `);
  const row = res.rows[0];
  return { eventsDeleted: Number(row?.events ?? 0), limitsDeleted: Number(row?.limits ?? 0) };
}
