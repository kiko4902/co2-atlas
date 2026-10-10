import { describe, expect, it } from "vitest";
import { comparison, rankOf, ratioToWorld, shareOfWorld, sourceShares } from "../src/stats.js";

describe("rankOf", () => {
  it("ranks highest first among non-null values", () => {
    const values = [10, null, 30, 20, 0];
    expect(rankOf(values, 2)).toEqual({ rank: 1, count: 4 });
    expect(rankOf(values, 0)).toEqual({ rank: 3, count: 4 });
    expect(rankOf(values, 4)).toEqual({ rank: 4, count: 4 });
  });

  it("gives ties the same rank", () => {
    expect(rankOf([5, 5, 1], 1)).toEqual({ rank: 1, count: 3 });
  });

  it("returns null for a missing value", () => {
    expect(rankOf([1, null], 1)).toBeNull();
  });
});

describe("shares", () => {
  it("share of world", () => {
    expect(shareOfWorld(25, 100)).toBe(0.25);
    expect(shareOfWorld(null, 100)).toBeNull();
    expect(shareOfWorld(5, 0)).toBeNull();
  });

  it("source shares keep missing sources as null", () => {
    expect(sourceShares({ coal: 30, oil: 70, other: null }, 100)).toEqual({
      coal: 0.3,
      oil: 0.7,
      other: null,
    });
    expect(sourceShares({ coal: 0 }, null)).toEqual({ coal: null });
  });
});

describe("comparison for the active metric", () => {
  const totals = [100, 10, null, 50];
  const perCapita = [2, 20, null, 5];

  it("total: rank by total and share of the world", () => {
    expect(comparison({ metric: "total", values: totals, index: 3, world: 200 })).toEqual({
      metric: "total",
      rank: { rank: 2, count: 3 },
      share: 0.25,
    });
  });

  it("per capita: rank by per capita and the world average, no share", () => {
    const c = comparison({ metric: "perCapita", values: perCapita, index: 3, world: 4 });
    expect(c).toEqual({
      metric: "perCapita",
      rank: { rank: 2, count: 3 },
      worldAverage: 4,
      ratio: 1.25,
    });
    expect(c).not.toHaveProperty("share");
  });

  it("missing per capita has no rank and no ratio", () => {
    expect(comparison({ metric: "perCapita", values: perCapita, index: 2, world: 4 })).toEqual({
      metric: "perCapita",
      rank: null,
      worldAverage: 4,
      ratio: null,
    });
  });

  it("ratio to the world average", () => {
    expect(ratioToWorld(9, 4.5)).toBe(2);
    expect(ratioToWorld(0, 4.5)).toBe(0);
    expect(ratioToWorld(null, 4.5)).toBeNull();
    expect(ratioToWorld(3, 0)).toBeNull();
    expect(ratioToWorld(3, null)).toBeNull();
  });
});
