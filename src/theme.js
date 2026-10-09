// @ts-check
/**
 * Colour tokens. The sequential ramp was generated in OKLCH (single red-orange hue,
 * monotone lightness) and validated as an ordinal ramp: lightest class 2.03:1 against
 * the surface. Source colours are the first six slots of the validated categorical
 * palette in fixed order. See DECISIONS.md (D6).
 */

/** Map classes, light to dark. */
export const RAMP = ["#e8a577", "#e18456", "#d9613b", "#c43e27", "#a2211c", "#76151a"];

/** Fills for values that are not a class. */
export const STATUS_FILL = {
  nodata: "#d4d3ce",
  zero: "#ffffff",
  noSeparate: "url(#hatch-no-separate)",
};

/** Emission sources in stacking order (bottom to top), with their categorical colours. */
export const SOURCES = /** @type {const} */ ([
  { key: "coal", label: "Coal", color: "#2a78d6" },
  { key: "oil", label: "Oil", color: "#eb6834" },
  { key: "gas", label: "Gas", color: "#1baf7a" },
  { key: "cement", label: "Cement", color: "#eda100" },
  { key: "flaring", label: "Flaring", color: "#e87ba4" },
  { key: "other", label: "Other", color: "#008300" },
]);
