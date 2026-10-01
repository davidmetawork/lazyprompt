import { describe, expect, it } from "vitest";
import { RANKING, bayesianScore, decayWeight, ratingWeight, wilsonLowerBound } from "@/server/ranking/score";

describe("bayesianScore", () => {
  it("returns the global mean with no ratings", () => {
    expect(bayesianScore(0, 0, 4.0)).toBe(4.0);
  });

  it("pulls a single 5-star rating strongly toward the mean", () => {
    // (8*4 + 5) / (8 + 1)
    expect(bayesianScore(5, 1, 4.0)).toBeCloseTo(37 / 9, 10);
  });

  it("lets many ratings dominate the prior", () => {
    const many = bayesianScore(30 * 4.7, 30, 4.0);
    expect(many).toBeCloseTo((8 * 4 + 141) / 38, 10);
    expect(many).toBeGreaterThan(bayesianScore(5, 1, 4.0));
  });

  it("honours a custom prior strength and guards a non-positive denominator", () => {
    expect(bayesianScore(10, 2, 3, 0)).toBe(5);
    expect(bayesianScore(0, 0, 3.3, 0)).toBe(3.3);
  });
});

describe("ratingWeight", () => {
  it("is 1 for trusted raters or accounts at least 7 days old, else 0.5", () => {
    expect(ratingWeight({ trustLevel: 1, accountAgeDays: 0 })).toBe(1);
    expect(ratingWeight({ trustLevel: 0, accountAgeDays: 7 })).toBe(1);
    expect(ratingWeight({ trustLevel: 0, accountAgeDays: 6.9 })).toBe(0.5);
  });
});

describe("decayWeight", () => {
  it("halves every 72 hours", () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(72)).toBeCloseTo(0.5, 10);
    expect(decayWeight(144)).toBeCloseTo(0.25, 10);
    expect(decayWeight(36, 36)).toBeCloseTo(0.5, 10);
  });

  it("clamps future ages to 1 and decays monotonically", () => {
    expect(decayWeight(-5)).toBe(1);
    expect(decayWeight(10)).toBeGreaterThan(decayWeight(20));
  });

  it("exposes the section 4 constants", () => {
    expect(RANKING).toMatchObject({ C: 8, DEFAULT_MEAN: 4.0, MIN_RATINGS_FOR_MEAN: 50, HALF_LIFE_HOURS: 72, WINDOW_DAYS: 7, MIN_ACTORS: 3 });
    expect(RANKING.WEIGHTS).toEqual({ copy: 1, render: 1, open: 2, worked: 2, save: 3, rating: 3, comment: 2 });
  });
});

describe("wilsonLowerBound", () => {
  it("is 0 for no votes", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("matches known values (z = 1.96)", () => {
    expect(wilsonLowerBound(5, 5)).toBeCloseTo(0.5655, 3);
    expect(wilsonLowerBound(8, 10)).toBeCloseTo(0.4902, 3);
    expect(wilsonLowerBound(0, 10)).toBeCloseTo(0, 6);
  });

  it("rewards more evidence at the same ratio and stays within [0, 1]", () => {
    expect(wilsonLowerBound(90, 100)).toBeGreaterThan(wilsonLowerBound(9, 10));
    for (const [pos, total] of [[0, 3], [3, 3], [50, 100], [7, 7]] as const) {
      const w = wilsonLowerBound(pos, total);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("clamps an over-count to a proportion of 1", () => {
    expect(wilsonLowerBound(12, 10)).toBeCloseTo(wilsonLowerBound(10, 10), 10);
  });
});
