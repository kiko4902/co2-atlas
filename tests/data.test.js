import { describe, expect, it } from "vitest";
import { DataError, Dataset, METRICS, checkSeriesFile } from "../src/data.js";

/** values[metric][yearIndex][entityIndex] = f(metric, yearIndex, entityIndex) */
function seriesFile(entities, years, f) {
  const n = years[1] - years[0] + 1;
  const values = Object.fromEntries(
    METRICS.map((m) => [
      m,
      Array.from({ length: n }, (_, y) => entities.map((_, e) => f(m, y, e))),
    ]),
  );
  return { schema: 1, years, units: {}, entities, values };
}

const countries = [
  { iso: "AAA", name: "Alpha" },
  { iso: "BBB", name: "Beta" },
];
const emissions = seriesFile(countries, [2000, 2002], (m, y, e) => {
  if (m !== "total") return 1;
  return e === 1 && y === 2 ? null : (y + 1) * (e + 1);
});
const aggregates = seriesFile([{ iso: "WLD", name: "World" }], [2000, 2002], (m, y) => 100 + y);
const features = [
  { type: "Feature", properties: { iso: "AAA", name: "Alpha", status: "data" }, geometry: null },
  {
    type: "Feature",
    properties: { iso: "AAO", name: "Alpha Overseas", status: "included", includedIn: "AAA" },
    geometry: null,
  },
];

describe("Dataset", () => {
  const ds = new Dataset(emissions, aggregates, features);

  it("indexes years and countries", () => {
    expect(ds.years).toEqual([2000, 2001, 2002]);
    expect(ds.yearIndex(2001)).toBe(1);
    expect(() => ds.yearIndex(1999)).toThrow(RangeError);
  });

  it("reads one year for the map and one country for the panel", () => {
    expect(ds.row("total", 2002)).toEqual([3, null]);
    expect(ds.series("total", "BBB")).toEqual([2, 4, null]);
    expect(ds.value("total", "AAA", 2001)).toBe(2);
    expect(ds.value("total", "ZZZ", 2001)).toBeNull();
  });

  it("returns a full EmissionRow", () => {
    expect(ds.rowFor("AAA", 2000)).toMatchObject({
      iso: "AAA",
      year: 2000,
      total: 1,
      coal: 1,
      perCapita: 1,
    });
  });

  it("reads the world total from the aggregates", () => {
    expect(ds.world("total", 2002)).toBe(102);
  });

  it("knows names of map-only features", () => {
    expect(ds.name("AAO")).toBe("Alpha Overseas");
    expect(ds.hasData("AAO")).toBe(false);
    expect(ds.hasData("AAA")).toBe(true);
  });
});

describe("checkSeriesFile", () => {
  it("rejects a wrong schema version", () => {
    expect(() => checkSeriesFile({ ...emissions, schema: 2 }, "x")).toThrow(DataError);
  });

  it("rejects ragged matrices", () => {
    const broken = structuredClone(emissions);
    broken.values.total[0].pop();
    expect(() => checkSeriesFile(broken, "x")).toThrow(/wrong length/);
  });
});
