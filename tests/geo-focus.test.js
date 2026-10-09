import { describe, expect, it } from "vitest";
import { fitTransform, focusBounds } from "../src/geo-focus.js";

/** Planar stand-in for a projected d3 geoPath: coordinates are pixels. */
const measure = {
  bounds(g) {
    const pts = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).flat(2);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [
      [Math.min(...xs), Math.min(...ys)],
      [Math.max(...xs), Math.max(...ys)],
    ];
  },
  area(g) {
    const [[x0, y0], [x1, y1]] = this.bounds(g);
    return (x1 - x0) * (y1 - y0);
  },
};

const box = (x, y, w, h) => [
  [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ],
];

describe("focusBounds", () => {
  it("ignores distant overseas parts", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [box(0, 0, 100, 50), box(900, 400, 20, 20)],
    };
    expect(focusBounds(geometry, measure)).toEqual([
      [0, 0],
      [100, 50],
    ]);
  });

  it("keeps large nearby parts (e.g. Alaska)", () => {
    const geometry = {
      type: "MultiPolygon",
      coordinates: [box(0, 0, 100, 50), box(-40, -30, 30, 20)],
    };
    expect(focusBounds(geometry, measure)).toEqual([
      [-40, -30],
      [100, 50],
    ]);
  });

  it("ignores tiny nearby islands", () => {
    const geometry = { type: "MultiPolygon", coordinates: [box(0, 0, 100, 50), box(105, 0, 2, 2)] };
    expect(focusBounds(geometry, measure)[1][0]).toBe(100);
  });
});

describe("fitTransform", () => {
  const viewport = { x0: 0, y0: 0, x1: 600, y1: 400 };

  it("centres the box in the visible viewport", () => {
    const t = fitTransform(
      [
        [100, 100],
        [200, 150],
      ],
      viewport,
      [1, 24],
      0,
    );
    expect(t.k).toBe(6); // min(600 / 100, 400 / 50)
    expect(t.x + t.k * 150).toBeCloseTo(300);
    expect(t.y + t.k * 125).toBeCloseTo(200);
  });

  it("respects the scale extent for tiny countries", () => {
    const t = fitTransform(
      [
        [10, 10],
        [10.5, 10.5],
      ],
      viewport,
      [1, 24],
    );
    expect(t.k).toBe(24);
  });

  it("never zooms out below 1", () => {
    const t = fitTransform(
      [
        [0, 0],
        [5000, 5000],
      ],
      viewport,
      [1, 24],
    );
    expect(t.k).toBe(1);
  });
});
