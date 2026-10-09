// @ts-check
import { createSourceBars } from "./charts/source-bars.js";
import { createStackedArea } from "./charts/stacked-area.js";
import { escapeHtml, formatMt, formatPerCapita, formatRank, formatShare } from "./format.js";
import { rankOf, shareOfWorld, sourceShares } from "./stats.js";
import { SOURCES } from "./theme.js";

/**
 * @typedef {import("./data.js").Dataset} Dataset
 */

/**
 * Country details. Built once; `show` swaps the country, `setYear` only updates
 * numbers, bar widths and the year marker (no DOM rebuild while the slider moves).
 * @param {object} options
 * @param {HTMLElement} options.root   the <aside> element
 * @param {Dataset} options.dataset
 * @param {() => void} options.onClose
 * @param {(iso: string) => void} options.onSelect   open another country (e.g. "included in")
 * @param {(expanded: boolean) => void} options.onToggleSheet
 */
export function createPanel({ root, dataset, onClose, onSelect, onToggleSheet }) {
  /** @param {string} selector */
  const $ = (selector) => /** @type {HTMLElement} */ (root.querySelector(selector));
  const title = $("[data-panel-title]");
  const subtitle = $("[data-panel-subtitle]");
  const notice = $("[data-panel-notice]");
  const details = $("[data-panel-details]");
  const statTotal = $("[data-stat-total]");
  const statPerCapita = $("[data-stat-percapita]");
  const statRank = $("[data-stat-rank]");
  const statShare = $("[data-stat-share]");
  const sourcesTitle = $("[data-sources-title]");
  const sourcesNote = $("[data-sources-note]");
  const chartTitle = $("[data-chart-title]");
  const sheetToggle = /** @type {HTMLButtonElement} */ ($("[data-sheet-toggle]"));

  const bars = createSourceBars($("[data-source-bars]"));
  const chart = createStackedArea($("[data-area-chart]"));

  $("[data-chart-legend]").innerHTML =
    SOURCES.map(
      (s) =>
        `<li><span class="key-swatch" style="background:${s.color}" aria-hidden="true"></span>${s.label}</li>`,
    ).join("") + `<li><span class="key-line" aria-hidden="true"></span>Total</li>`;

  /** @type {string | null} */
  let iso = null;
  let year = dataset.yearRange[1];

  /** @type {HTMLButtonElement} */ ($("[data-panel-close]")).addEventListener("click", onClose);
  sheetToggle.addEventListener("click", () => {
    onToggleSheet(sheetToggle.getAttribute("aria-expanded") !== "true");
  });
  notice.addEventListener("click", (event) => {
    const button = /** @type {HTMLElement} */ (event.target).closest("[data-open-iso]");
    if (button) onSelect(/** @type {string} */ (button.getAttribute("data-open-iso")));
  });

  function renderNumbers() {
    if (!iso || !dataset.hasData(iso)) return;
    const row = dataset.rowFor(iso, year);
    const index = /** @type {number} */ (dataset.indexByIso.get(iso));
    subtitle.textContent = `Fossil CO₂ emissions in ${year}`;
    statTotal.textContent = formatMt(row.total);
    statPerCapita.textContent = formatPerCapita(row.perCapita);
    statRank.textContent = formatRank(rankOf(dataset.row("total", year), index));
    statShare.textContent = formatShare(shareOfWorld(row.total, dataset.world("total", year)));

    /** @type {Record<string, number | null>} */
    const values = {};
    for (const s of SOURCES) values[s.key] = row[s.key];
    bars.update(values, sourceShares(values, row.total));
    sourcesTitle.textContent = `By source, ${year}`;
    const missing = SOURCES.filter((s) => values[s.key] == null).map((s) => s.label);
    sourcesNote.textContent =
      row.total == null
        ? `No data for ${year}.`
        : missing.length
          ? `n/a: no separate estimate (${missing.join(", ")}).`
          : "";
    chart.setYear(year);
  }

  /** @param {string} target */
  function renderNotice(target) {
    const feature = dataset.featureByIso.get(target);
    const parent = feature?.properties.includedIn;
    const name = escapeHtml(dataset.name(target));
    notice.innerHTML = parent
      ? `<p><strong>No separate data.</strong> The Global Carbon Project counts emissions of ${name} as part of ${escapeHtml(dataset.name(parent))}.</p>
         <button type="button" class="button" data-open-iso="${parent}">Show ${escapeHtml(dataset.name(parent))}</button>`
      : `<p><strong>No separate data.</strong> The Global Carbon Project dataset has no separate series for ${name}.</p>`;
  }

  return {
    get iso() {
      return iso;
    },
    /**
     * @param {string} nextIso
     * @param {number} nextYear
     */
    show(nextIso, nextYear) {
      iso = nextIso;
      year = nextYear;
      root.hidden = false;
      title.textContent = dataset.name(nextIso);
      const hasData = dataset.hasData(nextIso);
      details.hidden = !hasData;
      notice.hidden = hasData;
      if (!hasData) {
        subtitle.textContent = "Fossil CO₂ emissions";
        renderNotice(nextIso);
        return;
      }
      const name = dataset.name(nextIso);
      chartTitle.textContent = `By source, ${dataset.yearRange[0]}–${dataset.yearRange[1]}`;
      const total = dataset.series("total", nextIso);
      /** @type {Record<string, (number | null)[]>} */
      const sources = {};
      for (const s of SOURCES) sources[s.key] = dataset.series(s.key, nextIso);
      const last = total[total.length - 1];
      chart.setData(
        { years: dataset.years, total, sources },
        year,
        `Stacked area chart of ${name}'s fossil CO₂ emissions by source, ${dataset.yearRange[0]} to ${dataset.yearRange[1]}. ` +
          `Total in ${dataset.yearRange[1]}: ${formatMt(last, { unit: true })}. Use the arrow keys to read single years.`,
      );
      renderNumbers();
    },
    /** @param {number} nextYear */
    setYear(nextYear) {
      year = nextYear;
      if (!root.hidden) renderNumbers();
    },
    hide() {
      iso = null;
      root.hidden = true;
    },
    focusTitle() {
      title.focus({ preventScroll: true });
    },
    /** @param {boolean} expanded */
    setSheetExpanded(expanded) {
      root.classList.toggle("is-expanded", expanded);
      sheetToggle.setAttribute("aria-expanded", String(expanded));
      sheetToggle.setAttribute("aria-label", expanded ? "Collapse details" : "Expand details");
    },
  };
}

/** @typedef {ReturnType<typeof createPanel>} Panel */
