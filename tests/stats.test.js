import { describe, expect, it } from "vitest";
import { rankOf, shareOfWorld, sourceShares } from "../src/stats.js";

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
