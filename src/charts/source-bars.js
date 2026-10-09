// @ts-check
import { formatMt, formatShare } from "../format.js";
import { SOURCES } from "../theme.js";

/**
 * Horizontal bars of each source's share of the total, rendered as an HTML table so
 * the exact values are always readable as text (this is the chart's table view).
 * Rows are created once; `update` only changes widths and text.
 * @param {HTMLElement} container
 */
export function createSourceBars(container) {
  const table = document.createElement("table");
  table.className = "source-table";
  table.innerHTML = `
    <caption class="visually-hidden">Emissions by source</caption>
    <thead class="visually-hidden"><tr><th scope="col">Source</th><th scope="col">Share of total</th><th scope="col">Emissions</th></tr></thead>
    <tbody></tbody>`;
  const body = /** @type {HTMLTableSectionElement} */ (table.querySelector("tbody"));

  const rows = SOURCES.map((source) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <th scope="row"><span class="key-dot" style="background:${source.color}" aria-hidden="true"></span>${source.label}</th>
      <td class="source-bar-cell"><span class="source-bar-track"><span class="source-bar" style="background:${source.color}"></span></span><span class="source-share"></span></td>
      <td class="source-value"></td>`;
    body.append(tr);
    return {
      key: source.key,
      tr,
      bar: /** @type {HTMLElement} */ (tr.querySelector(".source-bar")),
      share: /** @type {HTMLElement} */ (tr.querySelector(".source-share")),
      value: /** @type {HTMLElement} */ (tr.querySelector(".source-value")),
    };
  });
  container.replaceChildren(table);

  return {
    /**
     * @param {Record<string, number | null>} values  Mt per source (null = not available)
     * @param {Record<string, number | null>} shares  fraction of total per source
     */
    update(values, shares) {
      for (const row of rows) {
        const value = values[row.key];
        const share = shares[row.key];
        const missing = value == null;
        row.tr.classList.toggle("is-missing", missing);
        row.bar.style.width = missing || share == null ? "0" : `${Math.min(100, share * 100)}%`;
        row.share.textContent = missing ? "n/a" : formatShare(share);
        row.value.textContent = missing ? "n/a" : formatMt(value);
      }
    },
  };
}
