// @ts-check

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** Duration for an animation, or 0 when the visitor prefers reduced motion. */
export function motion(/** @type {number} */ ms) {
  return reducedMotion?.matches ? 0 : ms;
}

/**
 * Announce a short message through the polite live region.
 * @param {string} message
 */
export function announce(message) {
  const region = document.getElementById("live-region");
  if (!region) return;
  region.textContent = "";
  // A new text node on the next frame makes screen readers re-read identical messages.
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

/**
 * Remove diacritics and case for search matching ("Côte" -> "cote").
 * @param {string} text
 */
export function normalize(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** True on the small-screen layout (bottom sheet instead of side panel). */
export function isCompactLayout() {
  return window.matchMedia("(max-width: 720px)").matches;
}
