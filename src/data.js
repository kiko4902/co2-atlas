// @ts-check
import { feature } from "topojson-client";

/**
 * @typedef {import("./types.js").Metric} Metric
 * @typedef {import("./types.js").SeriesFile} SeriesFile
 * @typedef {import("./types.js").EmissionRow} EmissionRow
 * @typedef {import("./types.js").CountryFeature} CountryFeature
 * @typedef {import("./types.js").Entity} Entity
 */

export const SCHEMA_VERSION = 1;
export const WORLD_ISO = "WLD";

/** @type {Metric[]} */
export const METRICS = ["total", "coal", "oil", "gas", "cement", "flaring", "other", "perCapita"];

export class DataError extends Error {}

/**
 * @param {unknown} json
 * @param {string} name
 * @returns {SeriesFile}
 */
export function checkSeriesFile(json, name) {
  const file = /** @type {SeriesFile} */ (json);
  if (!file || file.schema !== SCHEMA_VERSION) {
    throw new DataError(`${name}: unsupported schema ${file?.schema}`);
  }
  const yearCount = file.years[1] - file.years[0] + 1;
  for (const metric of METRICS) {
    const matrix = file.values?.[metric];
    if (!Array.isArray(matrix) || matrix.length !== yearCount) {
      throw new DataError(`${name}: metric ${metric} must have ${yearCount} rows`);
    }
    if (matrix.some((row) => row.length !== file.entities.length)) {
      throw new DataError(`${name}: metric ${metric} has rows of the wrong length`);
    }
  }
  return file;
}

/**
 * In-memory dataset with O(1) access by year (map) and by country (panel).
 * The pipeline already stores values year-major, so nothing is regrouped here.
 */
export class Dataset {
  /**
   * @param {SeriesFile} emissions
   * @param {SeriesFile} aggregates
   * @param {CountryFeature[]} features
   */
  constructor(emissions, aggregates, features) {
    this.emissions = emissions;
    this.aggregates = aggregates;
    this.source = emissions.source;
    /** @type {[number, number]} */
    this.yearRange = [emissions.years[0], emissions.years[1]];
    this.years = Array.from(
      { length: this.yearRange[1] - this.yearRange[0] + 1 },
      (_, i) => this.yearRange[0] + i,
    );
    this.countries = emissions.entities;
    /** @type {Map<string, number>} */
    this.indexByIso = new Map(this.countries.map((e, i) => [e.iso, i]));
    this.worldIndex = aggregates.entities.findIndex((e) => e.iso === WORLD_ISO);
    if (this.worldIndex < 0) throw new DataError("aggregates.json has no world total");

    this.features = features;
    /** @type {Map<string, CountryFeature>} */
    this.featureByIso = new Map(features.map((f) => [f.properties.iso, f]));
    /** @type {Map<string, string>} */
    this.nameByIso = new Map();
    for (const f of features) this.nameByIso.set(f.properties.iso, f.properties.name);
    for (const c of this.countries) this.nameByIso.set(c.iso, c.name);
  }

  /** @param {number} year */
  yearIndex(year) {
    const i = year - this.yearRange[0];
    if (i < 0 || i >= this.years.length) throw new RangeError(`Year ${year} out of range`);
    return i;
  }

  /**
   * All countries for one year, aligned with `this.countries`.
   * @param {Metric} metric
   * @param {number} year
   */
  row(metric, year) {
    return this.emissions.values[metric][this.yearIndex(year)];
  }

  /**
   * @param {Metric} metric
   * @param {string} iso
   * @param {number} year
   * @returns {number | null}
   */
  value(metric, iso, year) {
    const i = this.indexByIso.get(iso);
    if (i == null) return null;
    return this.emissions.values[metric][this.yearIndex(year)][i];
  }

  /**
   * One country across all years.
   * @param {Metric} metric
   * @param {string} iso
   * @returns {(number | null)[]}
   */
  series(metric, iso) {
    const i = this.indexByIso.get(iso);
    if (i == null) return this.years.map(() => null);
    return this.emissions.values[metric].map((row) => row[i]);
  }

  /**
   * @param {string} iso
   * @param {number} year
   * @returns {EmissionRow}
   */
  rowFor(iso, year) {
    /** @type {Record<string, number | null>} */
    const values = {};
    for (const metric of METRICS) values[metric] = this.value(metric, iso, year);
    return /** @type {EmissionRow} */ ({ iso, year, ...values });
  }

  /**
   * @param {Metric} metric
   * @param {number} year
   */
  world(metric, year) {
    return this.aggregates.values[metric][this.yearIndex(year)][this.worldIndex];
  }

  /** @param {string} iso */
  hasData(iso) {
    return this.indexByIso.has(iso);
  }

  /** @param {string} iso */
  name(iso) {
    return this.nameByIso.get(iso) ?? iso;
  }
}

/**
 * @param {string} baseUrl  Vite's import.meta.env.BASE_URL
 * @param {typeof fetch} [fetchImpl]
 */
export async function loadDataset(baseUrl, fetchImpl = fetch) {
  /** @param {string} file */
  const get = async (file) => {
    const response = await fetchImpl(`${baseUrl}data/${file}`);
    if (!response.ok) throw new DataError(`${file}: HTTP ${response.status}`);
    return response.json();
  };
  const [emissions, aggregates, topology] = await Promise.all([
    get("emissions.json"),
    get("aggregates.json"),
    get("countries.topo.json"),
  ]);
  const collection = /** @type {import("geojson").FeatureCollection} */ (
    /** @type {unknown} */ (feature(topology, topology.objects.countries))
  );
  return new Dataset(
    checkSeriesFile(emissions, "emissions.json"),
    checkSeriesFile(aggregates, "aggregates.json"),
    /** @type {CountryFeature[]} */ (collection.features),
  );
}
