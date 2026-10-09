// @ts-check
import { bisectCenter, max } from "d3-array";
import { axisBottom, axisLeft } from "d3-axis";
import { scaleLinear } from "d3-scale";
import { select } from "d3-selection";
import { area, line, stack, stackOrderNone } from "d3-shape";
import { formatAxisMt, formatMt } from "../format.js";
import { SOURCES } from "../theme.js";

/**
 * @typedef {object} AreaSeries
 * @property {number[]} years
 * @property {(number | null)[]} total
 * @property {Record<string, (number | null)[]>} sources  same length as years
 */

const HEIGHT = 230;
const MARGIN = { top: 16, right: 14, bottom: 26, left: 44 };

/**
 * One chart instead of two: sources stacked as areas, the total as a line on top.
 * Where GCP has no split for a year, the stack is lower than the total line and the
 * gap stays visible instead of being hidden. A crosshair shows exact values; a
 * marker shows the year selected on the slider.
 * @param {HTMLElement} container
 * @param {{ onInspect?: (year: number | null) => void }} [options]
 */
export function createStackedArea(container, { onInspect } = {}) {
  container.classList.add("area-chart");
  const svg = select(container)
    .append("svg")
    .attr("class", "area-svg")
    .attr("height", HEIGHT)
    .attr("tabindex", 0)
    .attr("role", "img");
  const grid = svg.append("g").attr("class", "grid");
  const layers = svg.append("g").attr("class", "layers");
  const totalPath = svg.append("path").attr("class", "total-line");
  const xAxis = svg.append("g").attr("class", "axis axis--x");
  const yAxis = svg.append("g").attr("class", "axis axis--y");
  const marker = svg.append("g").attr("class", "year-marker").attr("aria-hidden", "true");
  marker.append("line").attr("class", "year-marker-line");
  marker.append("circle").attr("class", "year-marker-dot").attr("r", 4);
  const markerLabel = marker.append("text").attr("class", "year-marker-label").attr("dy", -4);
  const crosshair = svg.append("line").attr("class", "crosshair").attr("aria-hidden", "true");
  const hit = svg.append("rect").attr("class", "hit-area").attr("fill", "transparent");

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;
  container.append(tip);

  /** @type {AreaSeries | null} */
  let data = null;
  let width = 0;
  let selectedYear = 0;
  /** @type {number | null} */
  let inspected = null;
  const x = scaleLinear();
  const y = scaleLinear();

  function draw() {
    if (!data) return;
    width = Math.max(240, container.clientWidth);
    svg.attr("width", width).attr("viewBox", `0 0 ${width} ${HEIGHT}`);
    const series = data;
    x.domain([series.years[0], series.years[series.years.length - 1]]).range([
      MARGIN.left,
      width - MARGIN.right,
    ]);

    const rows = series.years.map((year, i) => {
      /** @type {Record<string, number>} */
      const row = { year };
      for (const s of SOURCES) row[s.key] = series.sources[s.key][i] ?? 0;
      return row;
    });
    const stacked = stack()
      .keys(SOURCES.map((s) => s.key))
      .order(stackOrderNone)(rows);
    const top = Math.max(
      max(series.total, (v) => v ?? 0) ?? 0,
      max(stacked[stacked.length - 1], (d) => d[1]) ?? 0,
    );
    y.domain([0, top > 0 ? top : 1])
      .nice(4)
      .range([HEIGHT - MARGIN.bottom, MARGIN.top]);

    const ticks = y.ticks(4);
    grid
      .selectAll("line")
      .data(ticks)
      .join("line")
      .attr("x1", MARGIN.left)
      .attr("x2", width - MARGIN.right)
      .attr("y1", (d) => y(d))
      .attr("y2", (d) => y(d));

    const areaGen = area()
      .x((d) => x(/** @type {any} */ (d).data.year))
      .y0((d) => y(d[0]))
      .y1((d) => y(d[1]));
    layers
      .selectAll("path")
      .data(stacked)
      .join("path")
      .attr("class", "layer")
      .attr("fill", (_, i) => SOURCES[i].color)
      .attr("d", (d) => areaGen(/** @type {any} */ (d)));

    const totalLine = line()
      .defined((d) => d[1] != null)
      .x((d) => x(d[0]))
      .y((d) => y(/** @type {number} */ (d[1])));
    totalPath.attr(
      "d",
      totalLine(/** @type {any} */ (series.years.map((year, i) => [year, series.total[i]]))),
    );

    const tickEvery = width < 360 ? 20 : 10;
    const xTicks = series.years.filter((yr) => yr % tickEvery === 0);
    xAxis.attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`).call(
      axisBottom(x)
        .tickValues(xTicks)
        .tickFormat((d) => String(d))
        .tickSizeOuter(0),
    );
    yAxis
      .attr("transform", `translate(${MARGIN.left},0)`)
      .call(
        axisLeft(y)
          .tickValues(ticks)
          .tickFormat((d) => formatAxisMt(Number(d)))
          .tickSize(0)
          .tickPadding(6),
      )
      .call((g) => g.select(".domain").remove());

    hit
      .attr("x", MARGIN.left)
      .attr("y", MARGIN.top)
      .attr("width", width - MARGIN.left - MARGIN.right)
      .attr("height", HEIGHT - MARGIN.top - MARGIN.bottom);
    crosshair.attr("y1", MARGIN.top).attr("y2", HEIGHT - MARGIN.bottom);
    placeMarker();
    showInspect(inspected);
  }

  /** @param {number} year */
  function totalAt(year) {
    if (!data) return null;
    return data.total[year - data.years[0]] ?? null;
  }

  function placeMarker() {
    if (!data) return;
    const px = x(selectedYear);
    const total = totalAt(selectedYear);
    marker.attr("transform", `translate(${px},0)`);
    marker
      .select(".year-marker-line")
      .attr("y1", MARGIN.top)
      .attr("y2", HEIGHT - MARGIN.bottom);
    marker
      .select(".year-marker-dot")
      .attr("cy", total == null ? -99 : y(total))
      .attr("visibility", total == null ? "hidden" : null);
    const nearRight = px > width - 60;
    markerLabel
      .attr("y", MARGIN.top)
      .attr("text-anchor", nearRight ? "end" : "start")
      .attr("x", nearRight ? -4 : 4)
      .text(selectedYear);
  }

  /** @param {number | null} year */
  function showInspect(year) {
    inspected = year;
    if (!data || year == null) {
      crosshair.attr("visibility", "hidden");
      tip.hidden = true;
      return;
    }
    const i = year - data.years[0];
    const px = x(year);
    crosshair.attr("x1", px).attr("x2", px).attr("visibility", "visible");
    const items = SOURCES.map((s) => {
      const v = data?.sources[s.key][i];
      return `<li><span class="key-dot" style="background:${s.color}"></span>${s.label}<span>${v == null ? "n/a" : formatMt(v)}</span></li>`;
    })
      .reverse()
      .join("");
    tip.innerHTML = `<div class="chart-tip-head"><strong>${year}</strong><span>${formatMt(data.total[i], { unit: true })}</span></div><ul>${items}</ul>`;
    tip.hidden = false;
    const tipWidth = tip.offsetWidth;
    const left = px + 12 + tipWidth > width ? px - 12 - tipWidth : px + 12;
    tip.style.transform = `translate(${Math.max(0, left)}px, ${MARGIN.top}px)`;
  }

  /** @param {PointerEvent} event */
  function yearFromPointer(event) {
    if (!data) return null;
    const rect = /** @type {SVGRectElement} */ (hit.node()).getBoundingClientRect();
    const px = event.clientX - rect.left + MARGIN.left;
    const i = bisectCenter(data.years, x.invert(px));
    return data.years[Math.max(0, Math.min(data.years.length - 1, i))];
  }

  hit
    .on("pointermove pointerdown", (event) => {
      const year = yearFromPointer(event);
      showInspect(year);
      onInspect?.(year);
    })
    .on("pointerleave", () => {
      showInspect(null);
      onInspect?.(null);
    });

  // Arrow keys move the crosshair, Home/End jump to the ends, Escape clears it.
  svg.on("keydown", (event) => {
    if (!data) return;
    const first = data.years[0];
    const last = data.years[data.years.length - 1];
    const current = inspected ?? selectedYear;
    /** @type {Record<string, number>} */
    const moves = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: first, End: last };
    if (event.key in moves) {
      event.preventDefault();
      showInspect(Math.max(first, Math.min(last, moves[event.key])));
    } else if (event.key === "Escape" && inspected != null) {
      event.stopPropagation();
      showInspect(null);
    }
  });
  svg.on("blur", () => showInspect(null));

  const resizeObserver = new ResizeObserver(() => {
    if (Math.abs(container.clientWidth - width) > 1) draw();
  });
  resizeObserver.observe(container);

  return {
    /**
     * @param {AreaSeries} series
     * @param {number} year
     * @param {string} label  accessible description of the chart
     */
    setData(series, year, label) {
      data = series;
      selectedYear = year;
      inspected = null;
      svg.attr("aria-label", label);
      draw();
    },
    /** @param {number} year */
    setYear(year) {
      selectedYear = year;
      placeMarker();
    },
  };
}
