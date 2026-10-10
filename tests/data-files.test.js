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

  it("matches the published full-history CSV", () => {
    const manifest = read("manifest.json");
    const csv = readFileSync(
      new URL(`../public/data/co2-emissions-${manifest.source.version}.csv`, import.meta.url),
      "utf8",
    ).split(/\r?\n/);
    const header = csv[0].split(",");
    const col = (name) => header.indexOf(name);
    const last = dataset.yearRange[1];
    const rows = csv.slice(1).map((line) => line.split(","));
    for (const iso of ["CHN", "USA", "HRV", "WLD"]) {
      const row = rows.find((r) => r[col("code")] === iso && Number(r[col("year")]) === last);
      const expected = Number(row[col("total")]);
      const actual =
        iso === "WLD" ? dataset.world("total", last) : dataset.value("total", iso, last);
      expect(actual).toBeCloseTo(expected, 6);
    }
  });
});
