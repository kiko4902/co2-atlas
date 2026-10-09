// @ts-check
/**
 * Shared JSDoc types. This module has no runtime code.
 *
 * @typedef {"total" | "coal" | "oil" | "gas" | "cement" | "flaring" | "other" | "perCapita"} Metric
 * @typedef {"total" | "perCapita"} MapMetric
 * @typedef {"fixed" | "relative"} ScaleMode
 * @typedef {"data" | "included" | "none"} FeatureStatus
 *
 * @typedef {object} Entity
 * @property {string} iso
 * @property {string} name
 *
 * @typedef {object} Source
 * @property {string} title
 * @property {string} authors
 * @property {string} version
 * @property {string} published
 * @property {string} doi
 * @property {number} zenodoRecord
 * @property {string} license
 * @property {string} naturalEarth
 *
 * Columnar payload written by the pipeline (schema documented in pipeline/README.md).
 * `values[metric][yearIndex][entityIndex]`.
 * @typedef {object} SeriesFile
 * @property {number} schema
 * @property {[number, number]} years
 * @property {Record<string, string>} units
 * @property {Entity[]} entities
 * @property {Record<Metric, (number | null)[][]>} values
 * @property {Source} [source]
 *
 * One country-year as seen by the UI.
 * @typedef {object} EmissionRow
 * @property {string} iso
 * @property {number} year
 * @property {number | null} total
 * @property {number | null} coal
 * @property {number | null} oil
 * @property {number | null} gas
 * @property {number | null} cement
 * @property {number | null} flaring
 * @property {number | null} other
 * @property {number | null} perCapita
 *
 * @typedef {object} CountryProperties
 * @property {string} iso
 * @property {string} name
 * @property {FeatureStatus} status
 * @property {string} [includedIn]
 *
 * @typedef {import("geojson").Feature<import("geojson").Polygon | import("geojson").MultiPolygon, CountryProperties>} CountryFeature
 *
 * Central application state (see state.js).
 * @typedef {object} AppState
 * @property {number} year
 * @property {MapMetric} metric
 * @property {ScaleMode} mode
 * @property {string | null} selected  ISO code of the country shown in the panel
 * @property {boolean} sheetExpanded   mobile bottom sheet expanded to full height
 *
 * @typedef {"nodata" | "zero" | number} ValueClass  class index, or a status key
 */

export {};
