// @ts-check
import { normalize } from "./a11y.js";

/**
 * @typedef {{ iso: string, name: string }} SearchItem
 */

const MAX_RESULTS = 8;

/**
 * Rank matches: names starting with the query first, then word starts, then substrings.
 * @param {SearchItem[]} items
 * @param {string} query
 * @param {number} [limit]
 * @returns {SearchItem[]}
 */
export function searchCountries(items, query, limit = MAX_RESULTS) {
  const q = normalize(query);
  if (!q) return [];
  /** @type {{ item: SearchItem, score: number }[]} */
  const hits = [];
  for (const item of items) {
    const name = normalize(item.name);
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.split(/[\s\-(]+/).some((word) => word.startsWith(q))) score = 1;
    else if (name.includes(q) || item.iso.toLowerCase() === q) score = 2;
    if (score >= 0) hits.push({ item, score });
  }
  hits.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, "en"));
  return hits.slice(0, limit).map((h) => h.item);
}

/**
 * ARIA 1.2 combobox with a listbox popup (editable, list autocomplete).
 * @param {object} options
 * @param {HTMLInputElement} options.input
 * @param {HTMLUListElement} options.listbox
 * @param {SearchItem[]} options.items
 * @param {(iso: string) => void} options.onPick
 */
export function createSearch({ input, listbox, items, onPick }) {
  /** @type {SearchItem[]} */
  let results = [];
  let active = -1;

  function close() {
    results = [];
    active = -1;
    listbox.hidden = true;
    listbox.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function render() {
    if (results.length === 0) {
      const query = input.value.trim();
      if (!query) return close();
      listbox.innerHTML = `<li class="search-empty" role="option" aria-disabled="true">No country matches “${query.replace(/[<>&]/g, "")}”</li>`;
      listbox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }
    listbox.replaceChildren(
      ...results.map((item, i) => {
        const li = document.createElement("li");
        li.id = `search-option-${item.iso}`;
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", String(i === active));
        li.dataset.iso = item.iso;
        li.textContent = item.name;
        return li;
      }),
    );
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (active >= 0)
      input.setAttribute("aria-activedescendant", `search-option-${results[active].iso}`);
    else input.removeAttribute("aria-activedescendant");
  }

  /** @param {number} index */
  function pick(index) {
    const item = results[index];
    if (!item) return;
    input.value = item.name;
    close();
    onPick(item.iso);
  }

  input.addEventListener("input", () => {
    results = searchCountries(items, input.value);
    active = results.length ? 0 : -1;
    render();
  });

  input.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (listbox.hidden) {
          results = searchCountries(items, input.value);
          active = results.length ? 0 : -1;
        } else if (results.length) {
          active = (active + 1) % results.length;
        }
        render();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (results.length) {
          active = (active - 1 + results.length) % results.length;
          render();
        }
        break;
      case "Enter":
        if (!listbox.hidden && results.length) {
          event.preventDefault();
          pick(Math.max(0, active));
        }
        break;
      case "Escape":
        if (!listbox.hidden) {
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (input.value) {
          event.stopPropagation();
          input.value = "";
        }
        break;
      default:
        break;
    }
  });

  // pointerdown keeps focus in the input; click picks.
  listbox.addEventListener("pointerdown", (event) => event.preventDefault());
  listbox.addEventListener("click", (event) => {
    const li = /** @type {HTMLElement} */ (event.target).closest("[data-iso]");
    if (!li) return;
    pick(results.findIndex((r) => r.iso === li.getAttribute("data-iso")));
  });
  input.addEventListener("blur", () => close());

  return { close };
}
