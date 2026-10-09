import { describe, expect, it, vi } from "vitest";
import { searchCountries } from "../src/search.js";
import { createStore } from "../src/state.js";

const items = [
  { iso: "CIV", name: "Côte d'Ivoire" },
  { iso: "COD", name: "Democratic Republic of the Congo" },
  { iso: "COG", name: "Republic of the Congo" },
  { iso: "HRV", name: "Croatia" },
  { iso: "CUB", name: "Cuba" },
];

const isos = (list) => list.map((i) => i.iso);

describe("searchCountries", () => {
  it("ignores accents and case", () => {
    expect(isos(searchCountries(items, "cote"))).toEqual(["CIV"]);
  });

  it("ranks prefix matches before word and substring matches", () => {
    expect(isos(searchCountries(items, "c")).slice(0, 3)).toEqual(["CIV", "HRV", "CUB"]);
    expect(isos(searchCountries(items, "congo"))).toEqual(["COD", "COG"]);
  });

  it("matches ISO codes", () => {
    expect(isos(searchCountries(items, "hrv"))).toEqual(["HRV"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchCountries(items, "  ")).toEqual([]);
  });
});

describe("createStore", () => {
  const initial = {
    year: 2024,
    metric: "total",
    mode: "fixed",
    selected: null,
    sheetExpanded: false,
  };

  it("notifies with the set of changed keys only", () => {
    const store = createStore(initial);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ year: 2024, mode: "relative" });
    expect(listener).toHaveBeenCalledTimes(1);
    expect([...listener.mock.calls[0][1]]).toEqual(["mode"]);
    expect(store.get().mode).toBe("relative");
  });

  it("does nothing when nothing changes", () => {
    const store = createStore(initial);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ year: 2024 });
    expect(listener).not.toHaveBeenCalled();
  });
});
