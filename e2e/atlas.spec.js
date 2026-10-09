// @ts-check
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { formatMt } from "../src/format.js";

const manifest = JSON.parse(
  readFileSync(new URL("../public/data/manifest.json", import.meta.url), "utf8"),
);
const LAST_YEAR = manifest.appYears[1];

/** Total for one country and year from the published full-history CSV. */
function csvTotal(iso, year) {
  const csv = readFileSync(
    new URL(`../public/data/co2-emissions-${manifest.source.version}.csv`, import.meta.url),
    "utf8",
  );
  const header = csv.slice(0, csv.indexOf("\n")).split(",");
  const [codeCol, yearCol, totalCol] = ["code", "year", "total"].map((c) => header.indexOf(c));
  for (const line of csv.split("\n")) {
    const cells = line.split(",");
    if (cells[codeCol] === iso && Number(cells[yearCol]) === year) {
      return cells[totalCol] === "" ? null : Number(cells[totalCol]);
    }
  }
  throw new Error(`${iso} ${year} not in CSV`);
}

/** Collect console errors and failed requests for the whole test. */
function watchErrors(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("body.is-ready")).toBeAttached();
});

test("loads without console errors or failed requests", async ({ page }) => {
  const errors = watchErrors(page);
  await page.reload();
  await expect(page.locator("body.is-ready")).toBeAttached();
  await expect(page.locator("path.country")).toHaveCount(manifest.mapFeatures - 1); // no Antarctica
  expect(errors).toEqual([]);
});

const CASES = [
  { iso: "SRB", title: "Serbia" },
  { iso: "KSV", title: "Kosovo" },
  { iso: "AUS", title: "Australia" },
  { iso: "FRA", title: "France" },
  { iso: "GUF", title: "French Guiana", includedIn: "France" },
  { iso: "SOM", title: "Somalia" },
  { iso: "CYP", title: "Cyprus" },
  { iso: "ESH", title: "Western Sahara", includedIn: "Morocco" },
  { iso: "CHN", title: "China" },
  { iso: "HRV", title: "Croatia" },
];

test.describe("clicking a country", () => {
  test.skip(({ isMobile }) => isMobile, "covered by the touch test on mobile");

  for (const c of CASES) {
    test(`${c.title} opens the right panel with the source value`, async ({ page }) => {
      await page.locator(`path.country[data-iso="${c.iso}"]`).dispatchEvent("click");
      const panel = page.locator("#panel");
      await expect(panel).toBeVisible();
      await expect(panel.locator("#panel-title")).toHaveText(c.title);
      if (c.includedIn) {
        await expect(panel.locator("[data-panel-notice]")).toContainText(
          `as part of ${c.includedIn}`,
        );
        return;
      }
      const expected = formatMt(csvTotal(c.iso, LAST_YEAR));
      await expect(panel.locator("[data-stat-total]")).toHaveText(expected);

      // After zooming, the country's centre is in the part of the map left of the panel.
      await page.waitForTimeout(900);
      const box = await page.locator(`path.country[data-iso="${c.iso}"]`).boundingBox();
      const panelBox = await panel.boundingBox();
      expect(box && panelBox).toBeTruthy();
      if (box && panelBox) expect(box.x + box.width / 2).toBeLessThan(panelBox.x);
    });
  }
});

test("year slider updates the map, label and panel", async ({ page }) => {
  await page.locator('path.country[data-iso="DEU"]').dispatchEvent("click");
  const slider = page.locator("#year-slider");
  await expect(slider).toHaveAttribute("min", "1950");
  await expect(slider).toHaveAttribute("max", String(LAST_YEAR));
  await slider.fill("1990");
  await expect(slider).toHaveAttribute("aria-valuetext", "1990");
  await expect(page.locator("#year-output")).toHaveText("1990");
  await expect(page.locator("[data-panel-subtitle]")).toHaveText("Fossil CO₂ emissions in 1990");
  await expect(page.locator("[data-stat-total]")).toHaveText(formatMt(csvTotal("DEU", 1990)));
});

test("scale mode switch rebuilds the legend from the active scale", async ({ page }) => {
  const note = page.locator("[data-legend-note]");
  await expect(note).toHaveText(`Classes fixed across 1950–${LAST_YEAR}`);
  const fixedLabels = await page.locator("[data-legend-classes] li").allTextContents();
  await page.locator("label[for=mode-relative]").click();
  await expect(note).toContainText(`relative to ${LAST_YEAR}`);
  const relativeLabels = await page.locator("[data-legend-classes] li").allTextContents();
  expect(relativeLabels).toHaveLength(fixedLabels.length);
  expect(relativeLabels).not.toEqual(fixedLabels);
});

test.describe("keyboard", () => {
  test.skip(({ isMobile }) => isMobile, "desktop keyboard flow");

  test("Tab reaches search, slider, scale and countries; Enter/Escape open and close", async ({
    page,
  }) => {
    await page.keyboard.press("Tab");
    await expect(page.locator(".skip-link")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#country-search")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#year-slider")).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("#year-slider")).toHaveAttribute(
      "aria-valuetext",
      String(LAST_YEAR - 1),
    );
    await page.keyboard.press("Tab");
    await expect(page.locator("#mode-fixed")).toBeFocused();
    await page.keyboard.press("Tab");
    const first = page.locator("path.country").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-label", /Afghanistan: .* in \d{4}/);
    await page.keyboard.press("Enter");
    await expect(page.locator("#panel-title")).toHaveText("Afghanistan");
    await expect(page.locator("#panel-title")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#panel")).toBeHidden();
    await expect(first).toBeFocused();
  });

  test("search combobox opens a country", async ({ page }) => {
    const input = page.locator("#country-search");
    await input.fill("croa");
    await expect(input).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#country-search-list [role=option]").first()).toHaveText("Croatia");
    await input.press("Enter");
    await expect(page.locator("#panel-title")).toHaveText("Croatia");
    await expect(page.locator("#panel-title")).toBeFocused();
  });

  test("close button has an accessible name", async ({ page }) => {
    await page.locator('path.country[data-iso="FRA"]').dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Close details" })).toBeVisible();
  });
});

test.describe("touch", () => {
  test.skip(({ isMobile }) => !isMobile, "touch only");

  test("tap shows a tooltip; Show details opens the bottom sheet", async ({ page }) => {
    const brazil = page.locator('path.country[data-iso="BRA"]');
    const box = await brazil.boundingBox();
    if (!box) throw new Error("Brazil not drawn");
    await page.touchscreen.tap(box.x + box.width * 0.6, box.y + box.height * 0.4);
    const tooltip = page.locator("#tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("Brazil");
    await tooltip.getByRole("button", { name: "Show details" }).click();
    const panel = page.locator("#panel");
    await expect(panel.locator("#panel-title")).toHaveText("Brazil");
    const sheet = await panel.boundingBox();
    expect(sheet?.height).toBeLessThan(844 * 0.6);
    await page.locator("[data-sheet-toggle]").click();
    await expect(page.locator("[data-sheet-toggle]")).toHaveAttribute("aria-expanded", "true");
  });
});
