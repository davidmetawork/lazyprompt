// Pure ranking math (ARCHITECTURE.md section 4). No DB, no server-only; still do not import client-side.
import type { TrustLevel } from "@/lib/types";

export const RANKING = {
  C: 8, DEFAULT_MEAN: 4.0, MIN_RATINGS_FOR_MEAN: 50, HALF_LIFE_HOURS: 72, WINDOW_DAYS: 7, MIN_ACTORS: 3,
  /** Anonymous web events one IP hash may contribute to a prompt's trending score per day (the events and counters still record). */
  ANON_WEB_EVENTS_PER_PROMPT_DAY: 3,
  WEIGHTS: { copy: 1, render: 1, open: 2, worked: 2, save: 3, rating: 3, comment: 2 },
} as const;

/** bayes = (C*m + sum(w*stars)) / (C + sum(w)). */
export function bayesianScore(weightedSum: number, weightSum: number, globalMean: number, c: number = RANKING.C): number {
  const denom = c + weightSum;
  if (denom <= 0) return globalMean;
  return (c * globalMean + weightedSum) / denom;
}

/** 1.0 for trust >= 1 or an account at least 7 days old, else 0.5. */
export function ratingWeight(rater: { trustLevel: TrustLevel; accountAgeDays: number }): number {
  return rater.trustLevel >= 1 || rater.accountAgeDays >= 7 ? 1 : 0.5;
}

/** 0.5^(age/halfLife); future ages clamp to 1. */
export function decayWeight(ageHours: number, halfLifeHours: number = RANKING.HALF_LIFE_HOURS): number {
  if (ageHours <= 0) return 1;
  return Math.pow(0.5, ageHours / halfLifeHours);
}

/** Lower bound of the Wilson score interval for a binomial proportion. */
export function wilsonLowerBound(positive: number, total: number, z: number = 1.96): number {
  if (total <= 0) return 0;
  const p = Math.min(Math.max(positive / total, 0), 1);
  const z2 = z * z;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return (centre - margin) / (1 + z2 / total);
}
