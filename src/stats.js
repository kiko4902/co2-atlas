// @ts-check

/**
 * Competition rank ("1224" ranking) of `values[index]` among all non-null values,
 * highest first. Returns null when the value itself is missing.
 * @param {(number | null)[]} values
 * @param {number} index
 * @returns {{ rank: number, count: number } | null}
 */
export function rankOf(values, index) {
  const own = values[index];
  if (own == null) return null;
  let higher = 0;
  let count = 0;
  for (const v of values) {
    if (v == null) continue;
    count += 1;
    if (v > own) higher += 1;
  }
  return { rank: higher + 1, count };
}

/**
 * Share of the world total. The GCP world total includes international aviation and
 * shipping, which are not allocated to countries, so country shares sum to < 100 %.
 * @param {number | null | undefined} value
 * @param {number | null | undefined} world
 */
export function shareOfWorld(value, world) {
  if (value == null || world == null || world <= 0) return null;
  return value / world;
}

/**
 * Each source as a fraction of the total. A missing source stays null ("n/a"),
 * it is not turned into 0.
 * @template {string} K
 * @param {Record<K, number | null>} sources
 * @param {number | null} total
 * @returns {Record<K, number | null>}
 */
export function sourceShares(sources, total) {
  /** @type {Record<string, number | null>} */
  const out = {};
  for (const [key, value] of Object.entries(sources)) {
    out[key] = value == null || total == null || total <= 0 ? null : Number(value) / total;
  }
  return /** @type {Record<K, number | null>} */ (out);
}
