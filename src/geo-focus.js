// @ts-check

/**
 * @typedef {[[number, number], [number, number]]} Bounds
 * @typedef {import("geojson").Polygon | import("geojson").MultiPolygon} PolygonGeometry
 * @typedef {{ bounds: (g: PolygonGeometry) => Bounds, area: (g: PolygonGeometry) => number }} Measure
 *   Anything with d3 geoPath's `bounds` and `area` (projected pixels).
 */

/** Parts smaller than this fraction of the largest part never extend the focus box. */
export const MIN_PART_SHARE = 0.02;
/** A part joins the focus box if its gap to the box is below this fraction of the box diagonal. */
export const MAX_GAP_RATIO = 0.6;

/**
 * @param {Bounds} a
 * @param {Bounds} b
 */
function gapBetween(a, b) {
  const dx = Math.max(0, b[0][0] - a[1][0], a[0][0] - b[1][0]);
  const dy = Math.max(0, b[0][1] - a[1][1], a[0][1] - b[1][1]);
  return Math.hypot(dx, dy);
}

/**
 * @param {Bounds} a
 * @param {Bounds} b
 * @returns {Bounds}
 */
function union(a, b) {
  return [
    [Math.min(a[0][0], b[0][0]), Math.min(a[0][1], b[0][1])],
    [Math.max(a[1][0], b[1][0]), Math.max(a[1][1], b[1][1])],
  ];
}

/**
 * The box to zoom to: the largest polygon plus nearby large parts. Far-away overseas
 * territories (e.g. Hawaii, Svalbard, the Caribbean Netherlands) and the far side of
 * the antimeridian are left out, so no per-country coordinates need to be hard-coded.
 * @param {PolygonGeometry} geometry
 * @param {Measure} measure
 * @returns {Bounds}
 */
export function focusBounds(geometry, measure) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const parts = polygons
    .map((coordinates) => {
      /** @type {import("geojson").Polygon} */
      const polygon = { type: "Polygon", coordinates };
      return { bounds: measure.bounds(polygon), area: measure.area(polygon) };
    })
    .filter((p) => p.bounds.flat().every(Number.isFinite))
    .sort((a, b) => b.area - a.area);
  if (parts.length === 0) return measure.bounds(geometry);

  const [largest, ...rest] = parts;
  let box = largest.bounds;
  const diagonal = Math.hypot(box[1][0] - box[0][0], box[1][1] - box[0][1]);
  // Repeat until stable, so island chains are joined through their middle islands
  // (Luzon -> Visayas -> Mindanao) regardless of the order the parts are visited in.
  let pending = rest.filter((part) => part.area >= largest.area * MIN_PART_SHARE);
  let grew = true;
  while (grew) {
    grew = false;
    const next = [];
    for (const part of pending) {
      if (gapBetween(box, part.bounds) <= diagonal * MAX_GAP_RATIO) {
        box = union(box, part.bounds);
        grew = true;
      } else {
        next.push(part);
      }
    }
    pending = next;
  }
  return box;
}

/**
 * Zoom transform that fits `bounds` into the visible part of the map, i.e. the
 * viewport minus whatever the panel covers.
 * @param {Bounds} bounds
 * @param {{ x0: number, y0: number, x1: number, y1: number }} viewport
 * @param {[number, number]} scaleExtent
 * @param {number} [padding]  fraction of the viewport kept free around the box
 * @returns {{ k: number, x: number, y: number }}
 */
export function fitTransform(bounds, viewport, scaleExtent, padding = 0.12) {
  const width = Math.max(1, bounds[1][0] - bounds[0][0]);
  const height = Math.max(1, bounds[1][1] - bounds[0][1]);
  const vw = viewport.x1 - viewport.x0;
  const vh = viewport.y1 - viewport.y0;
  const fit = Math.min((vw * (1 - 2 * padding)) / width, (vh * (1 - 2 * padding)) / height);
  const k = Math.min(scaleExtent[1], Math.max(scaleExtent[0], fit));
  const cx = (bounds[0][0] + bounds[1][0]) / 2;
  const cy = (bounds[0][1] + bounds[1][1]) / 2;
  return {
    k,
    x: (viewport.x0 + viewport.x1) / 2 - k * cx,
    y: (viewport.y0 + viewport.y1) / 2 - k * cy,
  };
}
