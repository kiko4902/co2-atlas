import { describe, expect, it } from "vitest";
import {
  CLASS_COUNT,
  MAP_METRICS,
  classLabels,
  createColorScale,
  relativeThresholds,
  roundSignificant,
} from "../src/scales.js";
import { RAMP, STATUS_FILL } from "../src/theme.js";

const values = [0, null, 0.05, 0.5, 3, 20, 40, 150, 600, 2000, 12000, 7, 0.2, 1.5, 90, 300];

describe("fixed scale", () => {
  const scale = createColorScale({
    metric: "total",
    mode: "fixed",
    year: 1987,
    yearRange: [1950, 2024],
    values,
  });

  it("uses the configured decade thresholds regardless of the year", () => {
    expect(scale.thresholds).toEqual(MAP_METRICS.total.fixedThresholds);
    const other = createColorScale({
      metric: "total",
      mode: "fixed",
      year: 1950,
      yearRange: [1950, 2024],
      values: [1, 2, 3, 4, 5, 6],
    });
    expect(other.thresholds).toEqual(scale.thresholds);
  });

  it("classifies boundaries into the upper class", () => {
    expect(scale.classify(0.05)).toBe(0);
    expect(scale.classify(0.1)).toBe(1);
    expect(scale.classify(9.99)).toBe(2);
    expect(scale.classify(10)).toBe(3);
    expect(scale.classify(12000)).toBe(5);
  });

  it("keeps zero and missing apart from the classes", () => {
    expect(scale.classify(0)).toBe("zero");
    expect(scale.classify(null)).toBe("nodata");
    expect(scale.classify(undefined)).toBe("nodata");
    expect(scale.fill(0)).toBe(STATUS_FILL.zero);
    expect(scale.fill(null)).toBe(STATUS_FILL.nodata);
    expect(scale.fill(5)).toBe(RAMP[2]);
  });

  it("describes the mode for the legend", () => {
    expect(scale.description).toBe("Classes fixed across 1950–2024");
    expect(scale.labels).toEqual([
      "< 0.1",
      "0.1–1",
      "1–10",
      "10–100",
      "100–1,000",
      "≥ 1,000 Mt\u00a0CO₂",
    ]);
  });
});

describe("relative scale", () => {
  it("has the same number of classes as the fixed scale", () => {
    const scale = createColorScale({
      metric: "total",
      mode: "relative",
      year: 1987,
      yearRange: [1950, 2024],
      values,
    });
    expect(scale.thresholds).toHaveLength(CLASS_COUNT - 1);
    expect(scale.labels).toHaveLength(CLASS_COUNT);
    expect(scale.description).toContain("relative to 1987");
  });

  it("splits countries into roughly equal groups, ignoring zeros and nulls", () => {
    const vals = Array.from({ length: 60 }, (_, i) => i + 1);
    const t = relativeThresholds([...vals, 0, null, 0]);
    const counts = new Array(CLASS_COUNT).fill(0);
    for (const v of vals) counts[t.filter((x) => v >= x).length] += 1;
    for (const c of counts) {
      expect(c).toBeGreaterThanOrEqual(8);
      expect(c).toBeLessThanOrEqual(12);
    }
  });

  it("returns strictly increasing, rounded boundaries", () => {
    const t = relativeThresholds([0.0012, 0.0013, 0.0014, 0.0015, 0.0016, 0.0017, 0.0018, 9]);
    for (let i = 1; i < t.length; i += 1) expect(t[i]).toBeGreaterThan(t[i - 1]);
  });

  it("fails loudly with too few values", () => {
    expect(() => relativeThresholds([1, 2, 0, null])).toThrow();
  });
});

describe("per-capita scale", () => {
  // t CO2 per person: zeros, missing (no population), small values and outliers.
  const perCapita = [0, null, 0.05, 0.3, 0.8, 1.6, 2, 3.4, 4.7, 6.1, 8, 12, 15, 22, 41, 790];
  /** @param {"fixed" | "relative"} mode */
  const make = (mode, year = 2024, values = perCapita) =>
    createColorScale({ metric: "perCapita", mode, year, yearRange: [1950, 2024], values });

  it("fixed: uses the per-capita classes, not the Mt decades", () => {
    const scale = make("fixed");
    expect(scale.thresholds).toEqual([0.5, 1, 2.5, 5, 10]);
    expect(scale.thresholds).toEqual(MAP_METRICS.perCapita.fixedThresholds);
    expect(scale.labels).toEqual(["< 0.5", "0.5–1", "1–2.5", "2.5–5", "5–10", "≥ 10 t\u00a0CO₂"]);
    expect(make("fixed", 1950, [1, 2, 3, 4, 5, 6]).thresholds).toEqual(scale.thresholds);
  });

  it("fixed: open top class absorbs outliers from tiny populations", () => {
    const scale = make("fixed");
    expect(scale.classify(10)).toBe(5);
    expect(scale.classify(41)).toBe(5);
    expect(scale.classify(790)).toBe(5);
    expect(scale.classify(4.7)).toBe(3);
  });

  it("fixed: zero and missing per capita stay distinct", () => {
    const scale = make("fixed");
    expect(scale.classify(0)).toBe("zero");
    expect(scale.classify(null)).toBe("nodata");
    expect(scale.fill(null)).toBe(STATUS_FILL.nodata);
    expect(scale.fill(0)).toBe(STATUS_FILL.zero);
  });

  it("relative: quantile classes for the year, robust to one huge outlier", () => {
    const scale = make("relative");
    expect(scale.thresholds).toHaveLength(CLASS_COUNT - 1);
    expect(scale.description).toContain("relative to 2024");
    expect(scale.labels.at(-1)).toMatch(/ t\u00a0CO₂$/);
    const withoutOutlier = make("relative", 2024, perCapita.slice(0, -1).concat(42));
    expect(withoutOutlier.thresholds).toEqual(scale.thresholds);
  });

  it("is a function of (metric, mode, year)", () => {
    const a = make("relative", 1990, [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8]);
    const b = make("relative", 1990, [1, 2, 4, 8, 16, 32, 64, 128]);
    expect(a.thresholds).not.toEqual(b.thresholds);
    expect(make("fixed", 1990).thresholds).toEqual(make("fixed", 2010).thresholds);
    const total = createColorScale({
      metric: "total",
      mode: "fixed",
      year: 1990,
      yearRange: [1950, 2024],
      values: perCapita,
    });
    expect(total.thresholds).not.toEqual(make("fixed", 1990).thresholds);
  });
});

describe("helpers", () => {
  it("rounds to significant digits", () => {
    expect(roundSignificant(12289.04, 2)).toBe(12000);
    expect(roundSignificant(0.0031494, 2)).toBe(0.0031);
    expect(roundSignificant(0, 2)).toBe(0);
  });

  it("formats class labels", () => {
    expect(classLabels([1, 10], "Mt")).toEqual(["< 1", "1–10", "≥ 10 Mt"]);
  });
});
