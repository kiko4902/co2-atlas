import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatAxisMt,
  formatMt,
  formatPerCapita,
  formatRank,
  formatShare,
  formatThreshold,
} from "../src/format.js";

describe("formatMt", () => {
  it.each([
    [null, "No data"],
    [undefined, "No data"],
    [0, "0 Mt"],
    [0.0031494, "0.0031 Mt"],
    [0.24, "0.24 Mt"],
    [1.444, "1.44 Mt"],
    [17.403, "17.4 Mt"],
    [307.27, "307 Mt"],
    [5020.11, "5.02 Gt"],
    [12289.04, "12.3 Gt"],
  ])("%s -> %s", (value, expected) => {
    expect(formatMt(value)).toBe(expected);
  });

  it("can append the gas", () => {
    expect(formatMt(307.27, { unit: true })).toBe("307 Mt CO₂");
  });

  it("uses en-US grouping regardless of the browser locale", () => {
    expect(formatThreshold(1000)).toBe("1,000");
  });
});

describe("other formats", () => {
  it("per capita", () => {
    expect(formatPerCapita(14.758)).toBe("14.8 t");
    expect(formatPerCapita(1.892)).toBe("1.89 t");
    expect(formatPerCapita(0.0412)).toBe("0.041 t");
    expect(formatPerCapita(null)).toBe("No data");
  });

  it("share", () => {
    expect(formatShare(0.3061)).toBe("30.6%");
    expect(formatShare(0.0047)).toBe("0.47%");
    expect(formatShare(0.00001)).toBe("<0.01%");
    expect(formatShare(0)).toBe("0%");
    expect(formatShare(null)).toBe("No data");
  });

  it("rank", () => {
    expect(formatRank({ rank: 3, count: 216 })).toBe("#3 of 216");
    expect(formatRank(null)).toBe("No data");
  });

  it("axis ticks", () => {
    expect(formatAxisMt(0)).toBe("0");
    expect(formatAxisMt(800)).toBe("800");
    expect(formatAxisMt(12000)).toBe("12K");
  });

  it("escapes html", () => {
    expect(escapeHtml("Côte d'Ivoire <b>")).toBe("Côte d&#39;Ivoire &lt;b&gt;");
  });
});
