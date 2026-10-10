import { describe, expect, it, vi } from "vitest";
import { createStore } from "../src/state.js";
import {
  createUrlSync,
  defaultUrlState,
  parseUrlState,
  serializeUrlState,
} from "../src/url-state.js";

const context = {
  yearRange: /** @type {[number, number]} */ ([1950, 2024]),
  isKnownIso: (iso) => ["HRV", "DEU", "GUF", "ATA"].includes(iso),
};
const DEFAULTS = { year: 2024, metric: "total", mode: "fixed", selected: null };

describe("parseUrlState", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseUrlState("", context)).toEqual(DEFAULTS);
    expect(parseUrlState("?", context)).toEqual(DEFAULTS);
    expect(defaultUrlState(context)).toEqual(DEFAULTS);
  });

  it("reads every parameter", () => {
    expect(
      parseUrlState("?country=HRV&year=1990&metric=percapita&scale=relative", context),
    ).toEqual({ year: 1990, metric: "perCapita", mode: "relative", selected: "HRV" });
  });

  it("accepts lower case and surrounding spaces", () => {
    expect(
      parseUrlState("?country=hrv&metric=PerCapita&scale=RELATIVE&year=%201990", context),
    ).toEqual({ year: 1990, metric: "perCapita", mode: "relative", selected: "HRV" });
  });

  it("accepts territories without data and countries that are not drawn", () => {
    expect(parseUrlState("?country=GUF", context).selected).toBe("GUF");
    expect(parseUrlState("?country=ATA", context).selected).toBe("ATA");
  });

  it.each([
    ["unknown ISO", "?country=XXX", "selected"],
    ["ISO of the wrong length", "?country=HR", "selected"],
    ["aggregate code", "?country=WLD", "selected"],
    ["markup", "?country=%3Cscript%3E", "selected"],
    ["year before the range", "?year=1949", "year"],
    ["year after the range", "?year=2025", "year"],
    ["fractional year", "?year=1990.5", "year"],
    ["year with text", "?year=1990abc", "year"],
    ["empty year", "?year=", "year"],
    ["negative year", "?year=-1990", "year"],
    ["unknown metric", "?metric=gdp", "metric"],
    ["internal metric name with a typo", "?metric=per-capita", "metric"],
    ["unknown scale", "?scale=log", "mode"],
  ])("ignores %s", (_, query, key) => {
    expect(parseUrlState(query, context)[key]).toEqual(DEFAULTS[key]);
  });

  it("keeps the valid parameters when others are invalid", () => {
    expect(parseUrlState("?country=XXX&year=1990&metric=nope&scale=relative", context)).toEqual({
      ...DEFAULTS,
      year: 1990,
      mode: "relative",
    });
  });

  it("ignores unrelated parameters and uses the first of repeated ones", () => {
    expect(parseUrlState("?utm_source=x&year=1990&year=2000", context).year).toBe(1990);
  });

  it("does not throw on malformed encodings", () => {
    expect(() => parseUrlState("?country=%E0%A4%A&year=%", context)).not.toThrow();
    expect(parseUrlState("?country=%E0%A4%A&year=%", context)).toEqual(DEFAULTS);
  });
});

describe("serializeUrlState", () => {
  it("omits defaults", () => {
    expect(serializeUrlState(DEFAULTS, context)).toBe("");
  });

  it("writes only the changed values", () => {
    expect(serializeUrlState({ ...DEFAULTS, year: 1990 }, context)).toBe("?year=1990");
    expect(serializeUrlState({ ...DEFAULTS, metric: "perCapita" }, context)).toBe(
      "?metric=percapita",
    );
    expect(serializeUrlState({ ...DEFAULTS, mode: "relative" }, context)).toBe("?scale=relative");
  });

  it("round-trips through parse", () => {
    const state = { year: 1990, metric: "perCapita", mode: "relative", selected: "HRV" };
    const query = serializeUrlState(state, context);
    expect(query).toBe("?country=HRV&year=1990&metric=percapita&scale=relative");
    expect(parseUrlState(query, context)).toEqual(state);
  });
});

/** A fake window with a history stack, so pushState/replaceState/popstate can be checked. */
function fakeWindow(path = "/co2-atlas/", search = "") {
  const entries = [`${path}${search}`];
  let index = 0;
  const listeners = [];
  const location = {
    get pathname() {
      return new URL(entries[index], "https://x.test").pathname;
    },
    get search() {
      return new URL(entries[index], "https://x.test").search;
    },
    hash: "",
    get href() {
      return `https://x.test${entries[index]}`;
    },
  };
  const history = {
    state: null,
    replaceState: vi.fn((_, __, url) => {
      entries[index] = url;
    }),
    pushState: vi.fn((_, __, url) => {
      entries.splice(index + 1, Infinity, url);
      index += 1;
    }),
  };
  return {
    location,
    history,
    entries,
    addEventListener: (type, fn) => type === "popstate" && listeners.push(fn),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
    back() {
      index -= 1;
      for (const fn of listeners) fn();
    },
    forward() {
      index += 1;
      for (const fn of listeners) fn();
    },
    get url() {
      return entries[index];
    },
  };
}

describe("createUrlSync", () => {
  const setup = (search = "") => {
    vi.useFakeTimers();
    const win = fakeWindow("/co2-atlas/", search);
    const store = createStore({ ...parseUrlState(search, context), sheetExpanded: false });
    const sync = createUrlSync({ store, context, win: /** @type {any} */ (win), delay: 200 });
    return { win, store, sync };
  };

  it("cleans invalid parameters from the initial URL, keeping the base path", () => {
    const { win } = setup("?country=XXX&year=1990&metric=bad");
    expect(win.url).toBe("/co2-atlas/?year=1990");
    expect(win.history.pushState).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("debounces year changes into one replaceState", () => {
    const { win, store } = setup();
    for (let y = 2023; y >= 2000; y -= 1) store.set({ year: y });
    expect(win.history.replaceState).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(win.history.replaceState).toHaveBeenCalledTimes(1);
    expect(win.url).toBe("/co2-atlas/?year=2000");
    expect(win.history.pushState).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("pushes an entry when a country opens or closes, and Back/Forward restore it", () => {
    const { win, store } = setup();
    store.set({ metric: "perCapita" });
    store.set({ selected: "HRV" });
    expect(win.history.pushState).toHaveBeenCalledTimes(1);
    expect(win.url).toBe("/co2-atlas/?country=HRV&metric=percapita");
    // the entry we left got the pending metric change
    expect(win.entries[0]).toBe("/co2-atlas/?metric=percapita");

    store.set({ year: 1990 });
    store.set({ selected: null });
    expect(win.entries).toEqual([
      "/co2-atlas/?metric=percapita",
      "/co2-atlas/?country=HRV&year=1990&metric=percapita",
      "/co2-atlas/?year=1990&metric=percapita",
    ]);

    win.back();
    expect(store.get().selected).toBe("HRV");
    expect(store.get().year).toBe(1990);
    expect(win.history.pushState).toHaveBeenCalledTimes(2); // restoring does not push
    win.back();
    expect(store.get()).toMatchObject({ selected: null, year: 2024, metric: "perCapita" });
    win.forward();
    expect(store.get().selected).toBe("HRV");
    vi.useRealTimers();
  });

  it("href() flushes a pending change first", () => {
    const { store, sync } = setup();
    store.set({ year: 1975 });
    expect(sync.href()).toBe("https://x.test/co2-atlas/?year=1975");
    vi.useRealTimers();
  });
});
