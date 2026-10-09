// Integration checks on the files the pipeline actually produced (public/data/).
import { readFileSync } from "node:fs";
import { geoArea } from "d3-geo";
import { feature } from "topojson-client";
import { describe, expect, it } from "vitest";
import { Dataset, checkSeriesFile } from "../src/data.js";

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url), "utf8"));

const emissions = checkSeriesFile(read("emissions.json"), "emissions.json");
const aggregates = checkSeriesFile(read("aggregates.json"), "aggregates.json");
const topology = read("countries.topo.json");
const features = feature(topology, topology.objects.countries).features;
const dataset = new Dataset(emissions, aggregates, features);
const byIso = Object.fromEntries(features.map((f) => [f.properties.iso, f.properties]));

describe("published data", () => {
  it("has no aggregates among the map countries", () => {
    const codes = emissions.entities.map((e) => e.iso);
    for (const code of ["WLD", "XIA", "XIS", "XIT"]) expect(codes).not.toContain(code);
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
  });

  it("draws every country with d3 winding (area below a hemisphere)", () => {
    const inverted = features.filter((f) => geoArea(f) > 2 * Math.PI).map((f) => f.properties.iso);
    expect(inverted).toEqual([]);
  });

  it("uses each ISO code once on the map", () => {
    const codes = features.map((f) => f.properties.iso);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("links 'data' features to a series and 'included' features to a country", () => {
    for (const f of features) {
      const p = f.properties;
      if (p.status === "data") expect(dataset.hasData(p.iso)).toBe(true);
      if (p.status === "included") expect(dataset.hasData(p.includedIn)).toBe(true);
    }
  });

  it("applies the territory rules", () => {
    expect(byIso.KSV.status).toBe("data");
    expect(byIso.SRB.name).toBe("Serbia");
    expect(byIso.AUS.name).toBe("Australia");
    expect(byIso.GUF).toMatchObject({ status: "included", includedIn: "FRA" });
    expect(byIso.ESH).toMatchObject({ status: "included", includedIn: "MAR" });
    expect(byIso.SOM.name).toBe("Somalia");
    expect(byIso.CYP.name).toBe("Cyprus");
    expect(Object.keys(byIso)).not.toContain("-99");
  });

  it("matches known values from the source CSV", () => {
    // GCB2025v15_MtCO2_flat.csv: China 2024 Total = 12289.036755, Global 2024 = 38598.578033
    expect(dataset.value("total", "CHN", 2024)).toBeCloseTo(12289, 0);
    expect(dataset.world("total", 2024)).toBeCloseTo(38598.6, 0);
  });
});
