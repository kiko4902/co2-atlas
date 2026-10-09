// @ts-check
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity } from "d3-zoom";
import { motion } from "./a11y.js";
import { fitTransform, focusBounds } from "./geo-focus.js";

/**
 * @typedef {import("./types.js").CountryFeature} CountryFeature
 * @typedef {{ x0: number, y0: number, x1: number, y1: number }} Viewport
 * @typedef {"mouse" | "pen" | "touch" | "keyboard"} InputKind
 */

export const SCALE_EXTENT = /** @type {[number, number]} */ ([1, 24]);
/** Antarctica is not drawn: it would take a fifth of the map for 0.0x Mt. It stays searchable. */
export const HIDDEN_ON_MAP = new Set(["ATA"]);

const PADDING = 12;

/**
 * Draws every country path once. Afterwards only fills, labels, outlines and the
 * zoom transform change; `d` attributes are recomputed only on resize.
 *
 * @param {object} options
 * @param {HTMLElement} options.container
 * @param {CountryFeature[]} options.features
 * @param {(feature: CountryFeature, event: PointerEvent) => void} options.onHover
 * @param {() => void} options.onLeave
 * @param {(feature: CountryFeature, input: InputKind, event: Event) => void} options.onActivate
 * @param {() => void} options.onBackground  click on the ocean
 * @param {() => { top: number, bottom: number }} [options.fitInsets]  space taken by
 *   overlays (time bar, legend) that the initial world view should avoid
 */
export function createMap({
  container,
  features,
  onHover,
  onLeave,
  onActivate,
  onBackground,
  fitInsets = () => ({ top: 0, bottom: 0 }),
}) {
  const drawn = features
    .filter((f) => !HIDDEN_ON_MAP.has(f.properties.iso))
    // DOM order = tab order, so keyboard users move through countries alphabetically.
    .sort((a, b) => a.properties.name.localeCompare(b.properties.name, "en"));
  const featureByIso = new Map(drawn.map((f) => [f.properties.iso, f]));

  const svg = select(container)
    .append("svg")
    .attr("class", "map-svg")
    .attr("role", "group")
    .attr("aria-label", "World map. Use Tab to move between countries, Enter for details.");

  const pattern = svg
    .append("defs")
    .append("pattern")
    .attr("id", "hatch-no-separate")
    .attr("patternUnits", "userSpaceOnUse")
    .attr("width", 6)
    .attr("height", 6)
    .attr("patternTransform", "rotate(45)");
  pattern.append("rect").attr("width", 6).attr("height", 6).attr("fill", "#f3f2ee");
  pattern
    .append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", 6)
    .attr("stroke", "#a9a8a2")
    .attr("stroke-width", 1.5);

  const zoomLayer = svg.append("g").attr("class", "zoom-layer");
  const sphere = zoomLayer.append("path").attr("class", "sphere");
  const countryLayer = zoomLayer.append("g").attr("class", "countries");
  const overlay = zoomLayer.append("g").attr("class", "outlines").attr("aria-hidden", "true");
  const hoverOutline = overlay.append("path").attr("class", "outline outline--hover");
  const selectedOutline = overlay.append("path").attr("class", "outline outline--selected");
  const focusOutline = overlay.append("path").attr("class", "outline outline--focus");

  const paths = countryLayer
    .selectAll("path")
    .data(drawn, (d) => /** @type {CountryFeature} */ (d).properties.iso)
    .join("path")
    .attr("class", (d) => `country country--${d.properties.status}`)
    .attr("data-iso", (d) => d.properties.iso)
    .attr("tabindex", 0)
    .attr("role", "button");

  const projection = geoNaturalEarth1();
  const path = geoPath(projection);
  /** @type {string | null} */
  let selectedIso = null;
  /** @type {string | null} */
  let hoverIso = null;
  /** @type {string | null} */
  let focusIso = null;
  /** @type {InputKind} */
  let lastPointer = "mouse";
  let width = 0;
  let height = 0;

  const zoom = d3zoom()
    .scaleExtent(SCALE_EXTENT)
    .on("zoom", (event) => {
      zoomLayer.attr("transform", event.transform);
      container.classList.toggle("is-zoomed", event.transform.k > 1.01);
    });
  svg.call(/** @type {any} */ (zoom));

  /** @param {string | null} iso */
  const outlinePath = (iso) => {
    const f = iso ? featureByIso.get(iso) : null;
    return f ? path(f) : null;
  };

  function layout() {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const insets = fitInsets();
    projection.fitExtent(
      [
        [PADDING, PADDING + insets.top],
        [width - PADDING, Math.max(PADDING + insets.top + 50, height - PADDING - insets.bottom)],
      ],
      { type: "FeatureCollection", features: drawn },
    );
    sphere.attr("d", path({ type: "Sphere" }));
    paths.attr("d", (d) => path(d));
    hoverOutline.attr("d", outlinePath(hoverIso));
    selectedOutline.attr("d", outlinePath(selectedIso));
    focusOutline.attr("d", outlinePath(focusIso));
    zoom
      .extent([
        [0, 0],
        [width, height],
      ])
      .translateExtent([
        [-width * 0.5, -height * 0.5],
        [width * 1.5, height * 1.5],
      ]);
  }

  /** @param {Event} event */
  const datumOf = (event) => {
    const target = /** @type {Element | null} */ (event.target);
    const el = target?.closest?.("path.country");
    return el ? /** @type {CountryFeature} */ (select(el).datum()) : null;
  };

  countryLayer
    .on("pointerdown", (event) => {
      lastPointer = /** @type {InputKind} */ (event.pointerType || "mouse");
    })
    .on("pointermove", (event) => {
      if (event.pointerType === "touch") return;
      const d = datumOf(event);
      if (!d) return;
      if (d.properties.iso !== hoverIso) {
        hoverIso = d.properties.iso;
        hoverOutline.attr("d", outlinePath(hoverIso));
      }
      onHover(d, event);
    })
    .on("pointerleave", () => {
      hoverIso = null;
      hoverOutline.attr("d", null);
      onLeave();
    })
    .on("click", (event) => {
      const d = datumOf(event);
      if (d) onActivate(d, lastPointer, event);
      lastPointer = "mouse";
    })
    .on("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const d = datumOf(event);
      if (!d) return;
      event.preventDefault();
      onActivate(d, "keyboard", event);
    })
    .on("focusin", (event) => {
      const d = datumOf(event);
      focusIso = d ? d.properties.iso : null;
      focusOutline.attr("d", outlinePath(focusIso));
    })
    .on("focusout", () => {
      focusIso = null;
      focusOutline.attr("d", null);
    });

  svg.on("click", (event) => {
    if (!datumOf(event)) onBackground();
  });

  layout();

  return {
    features: drawn,
    /** Recompute the projection for the current container size. */
    resize() {
      layout();
    },
    /**
     * @param {(feature: CountryFeature) => string} fillFor
     * @param {{ animate?: boolean }} [options]
     */
    updateFills(fillFor, { animate = false } = {}) {
      const duration = animate ? motion(450) : 0;
      if (duration > 0) {
        paths
          .interrupt()
          .transition()
          .duration(duration)
          .attr("fill", (d) => fillFor(d));
      } else {
        paths.interrupt();
        for (const node of /** @type {SVGPathElement[]} */ (paths.nodes())) {
          node.setAttribute(
            "fill",
            fillFor(/** @type {CountryFeature} */ (/** @type {any} */ (node).__data__)),
          );
        }
      }
    },
    /** @param {(feature: CountryFeature) => string} labelFor */
    updateLabels(labelFor) {
      for (const node of /** @type {SVGPathElement[]} */ (paths.nodes())) {
        node.setAttribute(
          "aria-label",
          labelFor(/** @type {CountryFeature} */ (/** @type {any} */ (node).__data__)),
        );
      }
    },
    /** @param {string | null} iso */
    setSelected(iso) {
      selectedIso = iso;
      selectedOutline.attr("d", outlinePath(iso));
      paths.attr("aria-pressed", (d) => (d.properties.iso === iso ? "true" : null));
    },
    /** @param {string} iso */
    has(iso) {
      return featureByIso.has(iso);
    },
    /** @param {string} iso */
    focus(iso) {
      const node = countryLayer.select(`path[data-iso="${iso}"]`).node();
      /** @type {SVGPathElement | null} */ (node)?.focus({ preventScroll: true });
    },
    /**
     * Zoom so the country's main landmass fits the part of the map not covered by
     * the panel.
     * @param {string} iso
     * @param {{ top?: number, right?: number, bottom?: number }} insets  pixels covered by
     *   the panel and overlays
     * @param {{ animate?: boolean }} [options]
     */
    zoomTo(iso, insets, { animate = true } = {}) {
      const f = featureByIso.get(iso);
      if (!f) return;
      const bounds = focusBounds(f.geometry, path);
      /** @type {Viewport} */
      const viewport = {
        x0: 0,
        y0: Math.min(height * 0.5, insets.top ?? 0),
        x1: Math.max(width * 0.3, width - (insets.right ?? 0)),
        y1: Math.max(height * 0.3, height - (insets.bottom ?? 0)),
      };
      const t = fitTransform(bounds, viewport, SCALE_EXTENT);
      const transform = zoomIdentity.translate(t.x, t.y).scale(t.k);
      const duration = animate ? motion(750) : 0;
      svg
        .interrupt()
        .transition()
        .duration(duration)
        .call(/** @type {any} */ (zoom).transform, transform);
    },
    /** @param {{ animate?: boolean }} [options] */
    resetZoom({ animate = true } = {}) {
      svg
        .interrupt()
        .transition()
        .duration(animate ? motion(600) : 0)
        .call(/** @type {any} */ (zoom).transform, zoomIdentity);
    },
  };
}

/** @typedef {ReturnType<typeof createMap>} MapView */
