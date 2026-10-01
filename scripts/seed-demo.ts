// pnpm db:seed:demo: fake users, ratings and comments for LOCAL development only.
// Refuses to run unless DATABASE_URL points at localhost.
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { comments, profiles, prompts, ratings, user } from "../src/db/schema";
import { bayesianScore, RANKING } from "../src/server/ranking/score";
import { isLocalDatabaseUrl, isMain, loadDevEnv } from "./lib/env-files";

const NAMES = ["Ada", "Bruno", "Chen", "Dara", "Eli", "Fatima", "Gus", "Hana"];
const COMMENTS = [
  "Worked well for me on the first try.",
  "I swapped the tone to formal and it still held up.",
  "Great structure. I added one extra constraint at the end.",
  "Helpful starting point, thanks for sharing.",
];

// Small deterministic PRNG so repeated runs produce the same demo data.
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

async function main() {
  loadDevEnv();
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  if (!isLocalDatabaseUrl(url)) throw new Error("db:seed:demo refuses to run against a non-local database");
  process.env.DATABASE_URL = url;

  const users = NAMES.map((n, i) => ({ id: `demo_${i + 1}`, name: n, email: `${n.toLowerCase()}@demo.invalid` }));
  for (const u of users) {
    await db.insert(user).values({ ...u, emailVerified: true }).onConflictDoNothing();
    await db.insert(profiles).values({ userId: u.id, username: `demo-${u.name.toLowerCase()}`, trustLevel: 1 }).onConflictDoNothing();
  }

  const published = await db.select({ id: prompts.id }).from(prompts).where(eq(prompts.status, "published"));
  const rand = rng(42);
  let ratingRows = 0;
  for (const p of published) {
    for (const u of users) {
      if (rand() < 0.45) continue;
      const stars = 3 + Math.floor(rand() * 3);
      await db.insert(ratings).values({ userId: u.id, promptId: p.id, stars, weight: 1 }).onConflictDoNothing();
      ratingRows++;
    }
    if (rand() < 0.3) {
      const u = users[Math.floor(rand() * users.length)]!;
      const body = COMMENTS[Math.floor(rand() * COMMENTS.length)]!;
      const exists = await db.execute(sql`select 1 from comments where prompt_id = ${p.id} and author_id = ${u.id} limit 1`);
      if (!exists.rowCount) await db.insert(comments).values({ promptId: p.id, authorId: u.id, body });
    }
  }

  // Recompute counters from source rows (same invariant as the real write path).
  await db.execute(sql`
    UPDATE prompts p SET
      rating_count = s.c, rating_sum = s.sum, rating_weight_sum = s.w, rating_weighted_sum = s.ws
    FROM (SELECT prompt_id, count(*)::int c, sum(stars)::int sum, sum(weight) w, sum(weight * stars) ws
          FROM ratings GROUP BY prompt_id) s
    WHERE s.prompt_id = p.id`);
  await db.execute(sql`
    UPDATE prompts p SET comment_count = (SELECT count(*)::int FROM comments c WHERE c.prompt_id = p.id AND c.status = 'visible')`);
  const rows = await db.select({ id: prompts.id, ws: prompts.ratingWeightedSum, w: prompts.ratingWeightSum }).from(prompts);
  for (const r of rows) {
    await db.update(prompts)
      .set({ bayesScore: bayesianScore(r.ws, r.w, RANKING.DEFAULT_MEAN) })
      .where(eq(prompts.id, r.id));
  }
  console.log(`demo data: ${users.length} users, ${ratingRows} ratings considered across ${published.length} prompts`);
  await closeDb();
}

if (isMain("scripts/seed-demo.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
