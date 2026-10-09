// @ts-check
import "./styles.css";
import { announce, isCompactLayout } from "./a11y.js";
import { loadDataset } from "./data.js";
import { escapeHtml, formatMt, formatPerCapita } from "./format.js";
import { createLegend } from "./legend.js";
import { createMap } from "./map.js";
import { createPanel } from "./panel.js";
import { createColorScale } from "./scales.js";
import { createSearch } from "./search.js";
import { createStore } from "./state.js";
import { STATUS_FILL } from "./theme.js";
import { createTooltip } from "./tooltip.js";

/**
 * @typedef {import("./data.js").Dataset} Dataset
 * @typedef {import("./types.js").CountryFeature} CountryFeature
 * @typedef {import("./types.js").AppState} AppState
 * @typedef {import("./scales.js").ColorScale} ColorScale
 */

/** @param {string} id */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const BASE = import.meta.env.BASE_URL;

async function start() {
  const status = byId("app-status");
  try {
    const dataset = await loadDataset(BASE);
    init(dataset);
    status.hidden = true;
    document.body.classList.add("is-ready");
  } catch (error) {
    console.error(error);
    status.classList.add("is-error");
    status.innerHTML = `
      <p><strong>The data could not be loaded.</strong></p>
      <p>Check your connection and try again.</p>
      <button type="button" class="button" id="retry">Reload</button>`;
    byId("retry").addEventListener("click", () => window.location.reload());
  }
}

/** @param {Dataset} dataset */
function init(dataset) {
  const [firstYear, lastYear] = dataset.yearRange;
  const store = createStore({
    year: lastYear,
    metric: "total",
    mode: "fixed",
    selected: null,
    sheetExpanded: false,
  });

  const stage = byId("stage");
  const panelEl = byId("panel");
  const slider = /** @type {HTMLInputElement} */ (byId("year-slider"));
  const yearOutput = byId("year-output");
  const tooltip = createTooltip(byId("tooltip"), stage);
  const legend = createLegend(byId("legend"));

  /** @param {AppState} s */
  const makeScale = (s) =>
    createColorScale({
      metric: s.metric,
      mode: s.mode,
      year: s.year,
      yearRange: dataset.yearRange,
      values: dataset.row(s.metric, s.year),
    });
  let scale = makeScale(store.get());

  /** @param {CountryFeature} f */
  const fillFor = (f) => {
    if (f.properties.status !== "data") return STATUS_FILL.noSeparate;
    const { metric, year } = store.get();
    return scale.fill(dataset.value(metric, f.properties.iso, year));
  };

  /** @param {CountryFeature} f */
  const statusText = (f) => {
    const parent = f.properties.includedIn;
    return parent ? `No separate data, included in ${dataset.name(parent)}` : "No separate data";
  };

  /** @param {CountryFeature} f */
  const labelFor = (f) => {
    const { year } = store.get();
    const name = f.properties.name;
    if (f.properties.status !== "data") return `${name}: ${statusText(f)}`;
    const total = dataset.value("total", f.properties.iso, year);
    if (total == null) return `${name}: no data for ${year}`;
    const perCapita = dataset.value("perCapita", f.properties.iso, year);
    return `${name}: ${formatMt(total, { unit: true })} in ${year}, ${formatPerCapita(perCapita)} per person`;
  };

  /**
   * @param {CountryFeature} f
   * @param {{ withButton?: boolean }} [options]
   */
  const tooltipHtml = (f, { withButton = false } = {}) => {
    const { year } = store.get();
    const iso = f.properties.iso;
    let body;
    if (f.properties.status !== "data") {
      body = `<p class="tt-note">${escapeHtml(statusText(f))}</p>`;
    } else {
      const total = dataset.value("total", iso, year);
      body =
        total == null
          ? `<p class="tt-note">No data for ${year}</p>`
          : `<dl class="tt-values">
               <dt>Total</dt><dd>${formatMt(total, { unit: true })}</dd>
               <dt>Per person</dt><dd>${formatPerCapita(dataset.value("perCapita", iso, year))}</dd>
             </dl>`;
    }
    const button = withButton
      ? `<button type="button" class="button button--small" data-details="${iso}">Show details</button>`
      : "";
    return `<div class="tt-head"><strong>${escapeHtml(f.properties.name)}</strong><span>${year}</span></div>${body}${button}`;
  };

  /** @type {HTMLElement | null} */
  let returnFocus = null;

  /**
   * @param {string} iso
   * @param {{ via?: string }} [options]
   */
  function select(iso, { via = "mouse" } = {}) {
    if (via === "keyboard" || via === "search") {
      returnFocus = /** @type {HTMLElement | null} */ (document.activeElement);
    }
    tooltip.hide();
    store.set({ selected: iso, sheetExpanded: false });
    if (via === "keyboard" || via === "search") panel.focusTitle();
  }

  function close() {
    store.set({ selected: null, sheetExpanded: false });
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
  }

  const map = createMap({
    container: byId("map"),
    features: dataset.features,
    onHover(f, event) {
      if (!tooltip.pinned) tooltip.show(tooltipHtml(f), event.clientX, event.clientY);
    },
    onLeave() {
      if (!tooltip.pinned) tooltip.hide();
    },
    onActivate(f, input, event) {
      if (input === "touch") {
        const e = /** @type {MouseEvent} */ (event);
        tooltip.show(tooltipHtml(f, { withButton: true }), e.clientX, e.clientY, { pin: true });
        return;
      }
      select(f.properties.iso, { via: input });
    },
    onBackground() {
      if (tooltip.pinned) tooltip.hide();
    },
    fitInsets() {
      // On phones the time bar and legend span the full width, so the world view is
      // fitted between them. On wide screens they only cover ocean corners.
      if (!isCompactLayout()) return { top: 0, bottom: 0 };
      const box = stage.getBoundingClientRect();
      const timebar = byId("timebar").getBoundingClientRect();
      const legendBox = byId("legend").getBoundingClientRect();
      return { top: timebar.bottom - box.top, bottom: box.bottom - legendBox.top };
    },
  });

  const panel = createPanel({
    root: panelEl,
    dataset,
    onClose: close,
    onSelect: (iso) => select(iso, { via: "keyboard" }),
    onToggleSheet: (expanded) => store.set({ sheetExpanded: expanded }),
  });

  byId("tooltip").addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("[data-details]");
    if (button)
      select(/** @type {string} */ (button.getAttribute("data-details")), { via: "touch" });
  });

  /** Pixels of the map covered by the panel (right side on desktop, bottom sheet on phones). */
  const insets = () => {
    if (panelEl.hidden) return {};
    const rect = panelEl.getBoundingClientRect();
    if (!isCompactLayout()) return { right: rect.width };
    // The bottom sheet is fixed to the viewport, so measure its overlap with the map.
    const box = stage.getBoundingClientRect();
    const top = byId("timebar").getBoundingClientRect().bottom - box.top;
    return { top, bottom: Math.max(0, box.bottom - rect.top) };
  };

  // Year slider: real years as min/max/value, plus an explicit aria-valuetext.
  slider.min = String(firstYear);
  slider.max = String(lastYear);
  slider.value = String(lastYear);
  slider.addEventListener("input", () => store.set({ year: Number(slider.value) }));
  byId("year-range-start").textContent = String(firstYear);
  byId("year-range-end").textContent = String(lastYear);

  for (const radio of document.querySelectorAll('input[name="scale-mode"]')) {
    radio.addEventListener("change", (event) => {
      const value = /** @type {HTMLInputElement} */ (event.target).value;
      store.set({ mode: value === "relative" ? "relative" : "fixed" });
    });
  }

  const searchItems = [...dataset.nameByIso.entries()]
    .filter(([iso]) => dataset.hasData(iso) || dataset.featureByIso.has(iso))
    .map(([iso, name]) => ({ iso, name }));
  createSearch({
    input: /** @type {HTMLInputElement} */ (byId("country-search")),
    listbox: /** @type {HTMLUListElement} */ (byId("country-search-list")),
    items: searchItems,
    onPick: (iso) => select(iso, { via: "search" }),
  });

  /** @param {AppState} s */
  function renderYear(s) {
    slider.value = String(s.year);
    slider.setAttribute("aria-valuetext", String(s.year));
    yearOutput.textContent = String(s.year);
  }

  /**
   * Apply a state change, touching only what depends on the changed keys.
   * @param {AppState} s
   * @param {Set<keyof AppState>} changed
   */
  function render(s, changed) {
    const scaleChanged = changed.has("year") || changed.has("mode") || changed.has("metric");
    if (scaleChanged) {
      scale = makeScale(s);
      // Animate only a change of scale mode; slider moves update instantly.
      map.updateFills(fillFor, { animate: changed.has("mode") && !changed.has("year") });
      legend.update(scale);
      map.updateLabels(labelFor);
    }
    if (changed.has("year")) {
      renderYear(s);
      panel.setYear(s.year);
      if (tooltip.pinned) tooltip.hide();
    }
    if (changed.has("selected")) {
      map.setSelected(s.selected);
      if (s.selected) {
        panel.show(s.selected, s.year);
        document.body.classList.add("has-panel");
        announce(`Showing details for ${dataset.name(s.selected)}`);
        requestAnimationFrame(() => {
          if (s.selected) map.zoomTo(s.selected, insets());
        });
      } else {
        panel.hide();
        document.body.classList.remove("has-panel");
        map.resetZoom();
      }
    }
    if (changed.has("sheetExpanded")) panel.setSheetExpanded(s.sheetExpanded);
  }

  store.subscribe(render);
  render(store.get(), new Set(["year", "mode", "metric"]));

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (/** @type {HTMLDialogElement} */ (byId("about")).open) return;
    if (tooltip.pinned) tooltip.hide();
    else if (store.get().selected) close();
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      map.resize();
      const { selected } = store.get();
      if (selected) map.zoomTo(selected, insets(), { animate: false });
    }, 120);
  }).observe(stage);

  setupAbout(dataset);

  // Debug/measurement hook used by the Playwright verification script.
  /** @type {any} */ (window).__co2 = { store, dataset };
}

/** @param {Dataset} dataset */
function setupAbout(dataset) {
  const source = dataset.source;
  const dialog = /** @type {HTMLDialogElement} */ (byId("about"));
  if (source) {
    for (const el of document.querySelectorAll("[data-source-version]")) {
      el.textContent = source.version;
    }
    for (const el of document.querySelectorAll("[data-source-years]")) {
      el.textContent = `${dataset.yearRange[0]}–${dataset.yearRange[1]}`;
    }
    for (const el of document.querySelectorAll("a[data-csv]")) {
      /** @type {HTMLAnchorElement} */ (el).href =
        `${BASE}data/co2-emissions-${source.version}.csv`;
    }
  }
  for (const opener of document.querySelectorAll("[data-open-about]")) {
    opener.addEventListener("click", () => dialog.showModal());
  }
  byId("about-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

start();
