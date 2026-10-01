// Typo tolerance for search. pg_trgm similarity on a WHOLE title is too weak for short-word typos ('emial' vs
// 'email' share 2 of 10 trigrams), so when a query finds nothing we correct each token against a vocabulary of title and
// tag words (candidates via trigram similarity, verified with a Damerau-Levenshtein distance) and search again.
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { pickCorrection, tokenize } from "./typo";

/** Returns a corrected query string, or null when no token could be corrected. */
export async function correctQuery(q: string): Promise<string | null> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return null;
  // The vocabulary scan is unbounded in the number of prompts: cap it so a pathological query cannot hold a connection.
  const res = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL statement_timeout = 5000`);
    return tx.execute<{ token: string; word: string; n: number }>(sql`
    SELECT t.token, v.w AS word, count(*)::int AS n
    FROM unnest(array[${sql.join(tokens.map((t) => sql`${t}`), sql`, `)}]::text[]) AS t(token)
    JOIN (
      SELECT unnest(regexp_split_to_array(lower(title || ' ' || tags_text), '[^a-z0-9]+')) AS w
      FROM prompts WHERE status = 'published'
    ) v ON length(v.w) BETWEEN 3 AND 40 AND abs(length(v.w) - length(t.token)) <= 2 AND similarity(v.w, t.token) >= 0.15
    GROUP BY t.token, v.w
  `);
  });
  const byToken = new Map<string, { word: string; n: number }[]>();
  for (const r of res.rows) {
    const list = byToken.get(r.token) ?? [];
    list.push({ word: r.word, n: Number(r.n) });
    byToken.set(r.token, list);
  }
  const corrected = tokens.map((t) => pickCorrection(t, byToken.get(t) ?? []));
  return corrected.some((w, i) => w !== tokens[i]) ? corrected.join(" ") : null;
}
