// @ts-check
import { MAP_METRICS } from "./scales.js";
import { STATUS_FILL } from "./theme.js";

/**
 * @typedef {import("./scales.js").ColorScale} ColorScale
 */

const STATUS_ITEMS = [
  { key: "zero", label: "0 Mt", swatch: `background:${STATUS_FILL.zero}` },
  { key: "nodata", label: "No data", swatch: `background:${STATUS_FILL.nodata}` },
  { key: "none", label: "No separate data", swatch: "", className: "swatch--hatch" },
];

/**
 * The legend is generated from the very scale object the map uses, so the two
 * cannot drift apart.
 * @param {HTMLElement} root  element with [data-legend-title], [data-legend-classes],
 *   [data-legend-status] and [data-legend-note] children
 */
export function createLegend(root) {
  const title = /** @type {HTMLElement} */ (root.querySelector("[data-legend-title]"));
  const classes = /** @type {HTMLElement} */ (root.querySelector("[data-legend-classes]"));
  const status = /** @type {HTMLElement} */ (root.querySelector("[data-legend-status]"));
  const note = /** @type {HTMLElement} */ (root.querySelector("[data-legend-note]"));

  status.replaceChildren(
    ...STATUS_ITEMS.map((item) => {
      const li = document.createElement("li");
      li.className = "legend-item";
      li.dataset.status = item.key;
      li.innerHTML = `<span class="swatch ${item.className ?? ""}" style="${item.swatch}" aria-hidden="true"></span><span>${item.label}</span>`;
      return li;
    }),
  );

  /** @type {string} */
  let lastKey = "";

  return {
    /** @param {ColorScale} scale */
    update(scale) {
      const key = `${scale.metric}|${scale.mode}|${scale.thresholds.join(",")}|${scale.description}`;
      if (key === lastKey) return;
      lastKey = key;
      title.textContent = `${MAP_METRICS[scale.metric].label}, ${MAP_METRICS[scale.metric].unit}`;
      note.textContent = scale.description;
      classes.replaceChildren(
        ...scale.labels.map((label, i) => {
          const li = document.createElement("li");
          li.className = "legend-item";
          li.dataset.class = String(i);
          const swatch = document.createElement("span");
          swatch.className = "swatch";
          swatch.style.background = scale.colors[i];
          swatch.setAttribute("aria-hidden", "true");
          const text = document.createElement("span");
          text.textContent = label;
          li.append(swatch, text);
          return li;
        }),
      );
    },
  };
}
