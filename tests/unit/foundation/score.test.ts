import { describe, expect, it } from "vitest";
import { RANKING, bayesianScore, decayWeight, ratingWeight, wilsonLowerBound } from "@/server/ranking/score";

describe("bayesianScore", () => {
  it("returns the global mean with no ratings", () => {
    expect(bayesianScore(0, 0, 4)).toBe(4);
  });
  it("pulls small samples toward the mean", () => {
    // one 5-star rating: (8*4 + 5) / (8 + 1)
    expect(bayesianScore(5, 1, 4)).toBeCloseTo(37 / 9, 10);
  });
  it("converges to the sample mean with many ratings", () => {
    expect(bayesianScore(5 * 1000, 1000, 4)).toBeGreaterThan(4.98);
  });
  it("uses C = 8 by default and accepts an override", () => {
    expect(RANKING.C).toBe(8);
    expect(bayesianScore(10, 2, 3, 0)).toBe(5);
  });
});

describe("ratingWeight", () => {
  it("is 1 for trusted users or accounts at least 7 days old", () => {
    expect(ratingWeight({ trustLevel: 1, accountAgeDays: 0 })).toBe(1);
    expect(ratingWeight({ trustLevel: 0, accountAgeDays: 7 })).toBe(1);
  });
  it("is 0.5 for new, untrusted accounts", () => {
    expect(ratingWeight({ trustLevel: 0, accountAgeDays: 6.9 })).toBe(0.5);
  });
});

describe("decayWeight", () => {
  it("halves every 72 hours", () => {
    expect(decayWeight(0)).toBe(1);
    expect(decayWeight(72)).toBeCloseTo(0.5, 10);
    expect(decayWeight(144)).toBeCloseTo(0.25, 10);
  });
  it("honors a custom half-life and clamps negative ages", () => {
    expect(decayWeight(10, 10)).toBeCloseTo(0.5, 10);
    expect(decayWeight(-5)).toBe(1);
  });
});

describe("wilsonLowerBound", () => {
  it("is 0 for no votes", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });
  it("matches a known value (8 of 10, z = 1.96)", () => {
    expect(wilsonLowerBound(8, 10)).toBeCloseTo(0.4902, 3);
  });
  it("grows with sample size at the same proportion", () => {
    expect(wilsonLowerBound(80, 100)).toBeGreaterThan(wilsonLowerBound(8, 10));
  });
  it("stays within [0, 1]", () => {
    expect(wilsonLowerBound(10, 10)).toBeLessThanOrEqual(1);
    expect(wilsonLowerBound(0, 10)).toBeGreaterThanOrEqual(0);
  });
});
