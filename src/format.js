// @ts-check
import { formatLocale } from "d3-format";

/** Fixed en-US formatting regardless of the visitor's browser locale. */
const locale = formatLocale({
  decimal: ".",
  thousands: ",",
  grouping: [3],
  currency: ["$", ""],
  minus: "−",
});

const fixed0 = locale.format(",.0f");
const fixed1 = locale.format(",.1f");
const fixed2 = locale.format(",.2f");
const sig2 = locale.format(".2~r");
const pct1 = locale.format(".1%");
const pct2 = locale.format(".2%");
const threshold = locale.format(",~r");
const integer = locale.format(",d");

export const NO_DATA = "No data";

/**
 * Million tonnes of CO₂ with precision that matches the magnitude; ≥ 1,000 Mt is shown in Gt.
 * @param {number | null | undefined} mt
 * @param {{ unit?: boolean }} [options] append "CO₂" after the unit
 */
export function formatMt(mt, { unit = false } = {}) {
  if (mt == null || Number.isNaN(mt)) return NO_DATA;
  const suffix = unit ? " CO₂" : "";
  if (mt === 0) return `0 Mt${suffix}`;
  const abs = Math.abs(mt);
  if (abs >= 1000) {
    const gt = mt / 1000;
    return `${Math.abs(gt) >= 10 ? fixed1(gt) : fixed2(gt)} Gt${suffix}`;
  }
  if (abs >= 100) return `${fixed0(mt)} Mt${suffix}`;
  if (abs >= 10) return `${fixed1(mt)} Mt${suffix}`;
  if (abs >= 1) return `${fixed2(mt)} Mt${suffix}`;
  return `${sig2(mt)} Mt${suffix}`;
}

/**
 * Tonnes of CO₂ per person.
 * @param {number | null | undefined} t
 */
export function formatPerCapita(t) {
  if (t == null || Number.isNaN(t)) return NO_DATA;
  if (t === 0) return "0 t";
  if (t >= 10) return `${fixed1(t)} t`;
  if (t >= 0.1) return `${fixed2(t)} t`;
  return `${sig2(t)} t`;
}

/**
 * A fraction (0.318) as a percentage ("31.8%").
 * @param {number | null | undefined} fraction
 */
export function formatShare(fraction) {
  if (fraction == null || Number.isNaN(fraction)) return NO_DATA;
  if (fraction === 0) return "0%";
  if (fraction < 0.0001) return "<0.01%";
  return fraction < 0.01 ? pct2(fraction) : pct1(fraction);
}

/**
 * A multiple of a reference value: 1.2×, 0.45×, 12×.
 * @param {number | null | undefined} ratio
 */
export function formatRatio(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return NO_DATA;
  if (ratio === 0) return "0×";
  if (ratio < 0.01) return "<0.01×";
  return `${ratio >= 10 ? fixed0(ratio) : sig2(ratio)}×`;
}

/**
 * @param {{ rank: number, count: number } | null} rank
 */
export function formatRank(rank) {
  if (!rank) return NO_DATA;
  return `#${integer(rank.rank)} of ${integer(rank.count)}`;
}

/**
 * Class boundary for legends: 0.1, 1, 10, 1,000.
 * @param {number} value
 */
export function formatThreshold(value) {
  return threshold(value);
}

/**
 * Escape text for use inside HTML markup.
 * @param {string} text
 */
export function escapeHtml(text) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

/**
 * Compact axis tick: 0, 500, 1K, 12K (values in Mt).
 * @param {number} value
 */
export function formatAxisMt(value) {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1000) return `${locale.format("~r")(value / 1000)}K`;
  return locale.format("~r")(value);
}
