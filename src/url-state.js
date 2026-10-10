// @ts-check

/**
 * Shareable state in the query string: ?country=HRV&year=1990&metric=percapita&scale=relative.
 * Defaults are left out to keep links short. Anything invalid is ignored and falls
 * back to the default, so a bad link still opens the atlas.
 *
 * @typedef {import("./types.js").AppState} AppState
 * @typedef {import("./types.js").MapMetric} MapMetric
 * @typedef {import("./types.js").ScaleMode} ScaleMode
 * @typedef {import("./state.js").Store} Store
 *
 * @typedef {Pick<AppState, "year" | "metric" | "mode" | "selected">} UrlState
 *
 * @typedef {object} UrlContext
 * @property {[number, number]} yearRange
 * @property {(iso: string) => boolean} isKnownIso
 */

/** URL value <-> state value. */
const METRIC_PARAM = /** @type {const} */ ({ total: "total", perCapita: "percapita" });
const MODE_PARAM = /** @type {const} */ ({ fixed: "fixed", relative: "relative" });

/**
 * @template {string} K
 * @param {Record<K, string>} map
 * @param {string | null} param
 * @returns {K | null}
 */
function lookup(map, param) {
  if (param == null) return null;
  const wanted = param.trim().toLowerCase();
  for (const [key, value] of /** @type {[K, string][]} */ (Object.entries(map))) {
    if (value === wanted) return key;
  }
  return null;
}

/**
 * The state shown when the URL has no (valid) parameters.
 * @param {UrlContext} context
 * @returns {UrlState}
 */
export function defaultUrlState({ yearRange }) {
  return { year: yearRange[1], metric: "total", mode: "fixed", selected: null };
}

/**
 * @param {string} search  `location.search`, with or without the leading "?"
 * @param {UrlContext} context
 * @returns {UrlState}
 */
export function parseUrlState(search, context) {
  const state = defaultUrlState(context);
  /** @type {URLSearchParams} */
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    return state;
  }

  const year = params.get("year")?.trim();
  if (year && /^\d{4}$/.test(year)) {
    const y = Number(year);
    if (y >= context.yearRange[0] && y <= context.yearRange[1]) state.year = y;
  }

  const country = params.get("country")?.trim().toUpperCase();
  if (country && /^[A-Z]{3}$/.test(country) && context.isKnownIso(country)) {
    state.selected = country;
  }

  state.metric = lookup(METRIC_PARAM, params.get("metric")) ?? state.metric;
  state.mode = lookup(MODE_PARAM, params.get("scale")) ?? state.mode;
  return state;
}

/**
 * Query string for a state, without the defaults. Returns "" for the default view.
 * @param {UrlState} state
 * @param {UrlContext} context
 */
export function serializeUrlState(state, context) {
  const defaults = defaultUrlState(context);
  const params = new URLSearchParams();
  if (state.selected) params.set("country", state.selected);
  if (state.year !== defaults.year) params.set("year", String(state.year));
  if (state.metric !== defaults.metric) params.set("metric", METRIC_PARAM[state.metric]);
  if (state.mode !== defaults.mode) params.set("scale", MODE_PARAM[state.mode]);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Keeps the address bar in sync with the store.
 * - year, metric and scale replace the current history entry (debounced while the
 *   slider is dragged);
 * - opening or closing a country adds a history entry, so Back/Forward work;
 * - popstate restores the state of that entry.
 * The page path (e.g. the /co2-atlas/ base on GitHub Pages) and hash are kept.
 *
 * @param {object} options
 * @param {Store} options.store
 * @param {UrlContext} options.context
 * @param {Pick<Window, "location" | "history" | "addEventListener" | "setTimeout" | "clearTimeout">} [options.win]
 * @param {number} [options.delay]  debounce for replaceState, ms
 * @param {(state: UrlState) => void} [options.onRestore]  called after Back/Forward
 */
export function createUrlSync({ store, context, win = window, delay = 250, onRestore }) {
  let timer = 0;
  let restoring = false;

  /** @param {UrlState} state */
  const urlFor = (state) => {
    const { pathname, hash } = win.location;
    return `${pathname}${serializeUrlState(state, context)}${hash}`;
  };
  const current = () => `${win.location.pathname}${win.location.search}${win.location.hash}`;

  /** @param {UrlState} state */
  function replace(state) {
    const url = urlFor(state);
    if (url !== current()) win.history.replaceState(win.history.state, "", url);
  }

  function flush() {
    if (!timer) return;
    win.clearTimeout(timer);
    timer = 0;
    replace(store.get());
  }

  store.subscribe((state, changed, previous) => {
    if (restoring) return;
    if (changed.has("selected")) {
      // Close the entry we are leaving with its own country and the latest year etc.
      if (timer) {
        win.clearTimeout(timer);
        timer = 0;
        replace({ ...state, selected: previous.selected });
      }
      const url = urlFor(state);
      if (url !== current()) win.history.pushState(null, "", url);
      return;
    }
    if (changed.has("year") || changed.has("metric") || changed.has("mode")) {
      win.clearTimeout(timer);
      timer = win.setTimeout(() => {
        timer = 0;
        replace(store.get());
      }, delay);
    }
  });

  win.addEventListener("popstate", () => {
    win.clearTimeout(timer);
    timer = 0;
    const next = parseUrlState(win.location.search, context);
    restoring = true;
    try {
      store.set(next);
    } finally {
      restoring = false;
    }
    onRestore?.(next);
  });

  // Drop invalid or default parameters from the URL we were opened with.
  replace(store.get());

  return {
    /** Write any pending change now (e.g. before copying the link). */
    flush,
    /** The current shareable URL. */
    href() {
      flush();
      return win.location.href;
    },
  };
}
