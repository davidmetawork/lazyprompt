// Pure typo-tolerance helpers (no DB, no server-only).
/** Optimal-string-alignment distance (insert, delete, substitute, adjacent transposition). */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array<number>(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i]![0] = i;
  for (let j = 0; j <= bl; j++) d[0]![j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[al]![bl]!;
}

/** Allowed edits: none for 1-3 chars, 1 for 4-5, 2 from 6 chars on. */
export function maxTypoDistance(len: number): number {
  return len <= 3 ? 0 : len <= 5 ? 1 : 2;
}

export function tokenize(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 6);
}

/** Picks the best vocabulary word for `token` (closest, then most frequent), or the token itself if nothing is close enough. */
export function pickCorrection(token: string, candidates: { word: string; n: number }[]): string {
  const max = maxTypoDistance(token.length);
  if (max === 0 || candidates.some((c) => c.word === token)) return token;
  let best: { word: string; dist: number; n: number } | null = null;
  for (const c of candidates) {
    const dist = damerauLevenshtein(token, c.word);
    if (dist > max) continue;
    if (!best || dist < best.dist || (dist === best.dist && c.n > best.n)) best = { word: c.word, dist, n: c.n };
  }
  return best ? best.word : token;
}
