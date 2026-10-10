// @ts-check
import { bisectRight, quantileSorted } from "d3-array";
import { formatThreshold } from "./format.js";
import { RAMP, STATUS_FILL } from "./theme.js";

/**
 * Scale = f(metric, mode, year). Both modes produce the same number of classes,
 * so the legend layout never changes; only the boundaries do.
 *
 * @typedef {import("./types.js").MapMetric} MapMetric
 * @typedef {import("./types.js").ScaleMode} ScaleMode
 * @typedef {import("./types.js").ValueClass} ValueClass
 *
 * @typedef {object} ColorScale
 * @property {MapMetric} metric
 * @property {ScaleMode} mode
 * @property {number} year
 * @property {number[]} thresholds   ascending class boundaries (length = classes - 1)
 * @property {readonly string[]} colors
 * @property {string[]} labels       one label per class
 * @property {string} description    which mode is active, in words
 * @property {(value: number | null | undefined) => ValueClass} classify
 * @property {(value: number | null | undefined) => string} fill
 */

/** Labels, units and fixed class boundaries per map metric. */
export const MAP_METRICS = {
  total: {
    label: "Fossil CO₂ emissions",
    short: "Total",
    unit: "Mt\u00a0CO₂", // no-break space
    zeroLabel: "0 Mt",
    // Decades of Mt. Chosen from the 1950–2024 distribution of country values:
    // p10 ≈ 0.09, p40 ≈ 2.2, p60 ≈ 10, p80 ≈ 56, p99 ≈ 1,700 (see DECISIONS.md, D6).
    fixedThresholds: [0.1, 1, 10, 100, 1000],
  },
  perCapita: {
    label: "Fossil CO₂ emissions per person",
    short: "Per person",
    unit: "t\u00a0CO₂",
    zeroLabel: "0 t",
    // 1950–2024 country values: p30 ≈ 0.58, p40 ≈ 1.1, p60 ≈ 3.3, p70 ≈ 5.1, p90 ≈ 11.
    // Classes hold 28/11/16/14/18/13 % of them. The top class is open-ended, so
    // oil states and tiny islands (Sint Maarten 1950s: 790 t) do not stretch the
    // scale (see DECISIONS.md, D9).
    fixedThresholds: [0.5, 1, 2.5, 5, 10],
  },
};

/** @type {MapMetric[]} */
export const MAP_METRIC_KEYS = ["total", "perCapita"];

export const CLASS_COUNT = RAMP.length;

/**
 * Round to `digits` significant digits.
 * @param {number} value
 * @param {number} digits
 */
export function roundSignificant(value, digits) {
  if (value === 0 || !Number.isFinite(value)) return value;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (digits - 1 - magnitude);
  return Math.round(value * factor) / factor;
}

/**
 * Equal-count (quantile) boundaries for one year, rounded to the fewest significant
 * digits that keep them strictly increasing. Zeros and missing values are ignored:
 * they have their own legend entries.
 * @param {(number | null)[]} values
 * @param {number} [classes]
 * @returns {number[]}
 */
export function relativeThresholds(values, classes = CLASS_COUNT) {
  const positive = values
    .filter((v) => v != null && Number.isFinite(v) && v > 0)
    .map(Number)
    .sort((a, b) => a - b);
  if (positive.length < classes) {
    throw new Error(`Need at least ${classes} positive values, got ${positive.length}`);
  }
  const raw = Array.from({ length: classes - 1 }, (_, i) =>
    Number(quantileSorted(positive, (i + 1) / classes)),
  );
  for (let digits = 2; digits <= 6; digits += 1) {
    const rounded = raw.map((v) => roundSignificant(v, digits));
    if (rounded.every((v, i) => i === 0 || v > rounded[i - 1])) return rounded;
  }
  return raw;
}

/**
 * @param {number[]} thresholds
 * @param {string} unit
 */
export function classLabels(thresholds, unit) {
  const t = thresholds.map(formatThreshold);
  const labels = [`< ${t[0]}`];
  for (let i = 1; i < t.length; i += 1) labels.push(`${t[i - 1]}–${t[i]}`);
  labels.push(`≥ ${t[t.length - 1]}`);
  labels[labels.length - 1] += ` ${unit}`;
  return labels;
}

/**
 * @param {object} options
 * @param {MapMetric} options.metric
 * @param {ScaleMode} options.mode
 * @param {number} options.year
 * @param {[number, number]} options.yearRange   full range the fixed classes cover
 * @param {(number | null)[]} options.values     the metric for every country in `year`
 * @returns {ColorScale}
 */
export function createColorScale({ metric, mode, year, yearRange, values }) {
  const config = MAP_METRICS[metric];
  const thresholds =
    mode === "fixed" ? [...config.fixedThresholds] : relativeThresholds(values, CLASS_COUNT);
  const description =
    mode === "fixed"
      ? `Classes fixed across ${yearRange[0]}–${yearRange[1]}`
      : `Classes relative to ${year}: about the same number of countries in each`;

  /** @type {(value: number | null | undefined) => ValueClass} */
  const classify = (value) => {
    if (value == null || Number.isNaN(value)) return "nodata";
    if (value === 0) return "zero";
    return bisectRight(thresholds, value);
  };

  return {
    metric,
    mode,
    year,
    thresholds,
    colors: RAMP,
    labels: classLabels(thresholds, config.unit),
    description,
    classify,
    fill(value) {
      const c = classify(value);
      if (c === "nodata") return STATUS_FILL.nodata;
      if (c === "zero") return STATUS_FILL.zero;
      return RAMP[c];
    },
  };
}
