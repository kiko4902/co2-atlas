// @ts-check
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { formatMt, formatPerCapita } from "../src/format.js";

const manifest = JSON.parse(
  readFileSync(new URL("../public/data/manifest.json", import.meta.url), "utf8"),
);
const LAST_YEAR = manifest.appYears[1];

/** One value (total by default) for a country and year from the published full-history CSV. */
function csvTotal(iso, year, column = "total") {
  const csv = readFileSync(
    new URL(`../public/data/co2-emissions-${manifest.source.version}.csv`, import.meta.url),
    "utf8",
  );
  const header = csv.slice(0, csv.indexOf("\n")).split(",");
  const [codeCol, yearCol, totalCol] = ["code", "year", column].map((c) => header.indexOf(c));
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
    await expect(page.locator("#metric-total")).toBeFocused();
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

test.describe("per capita and shareable URLs", () => {
  test("a shared link restores country, year and metric", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("./?country=HRV&year=1990&metric=percapita");
    await expect(page.locator("body.is-ready")).toBeAttached();
    const panel = page.locator("#panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator("#panel-title")).toHaveText("Croatia");
    await expect(page.locator("#year-slider")).toHaveValue("1990");
    await expect(page.locator("#year-output")).toHaveText("1990");
    await expect(page.locator("[data-legend-title]")).toHaveText(
      "Fossil CO₂ emissions per person, t CO₂",
    );
    await expect(page.locator("#metric-percapita")).toBeChecked();
    await expect(page.locator("#mode-fixed")).toBeChecked();
    await expect(panel.locator('[data-stat="perCapita"]')).toHaveClass(/is-active/);
    await expect(panel.locator("[data-stat-percapita]")).toHaveText(
      formatPerCapita(csvTotal("HRV", 1990, "per_capita")),
    );
    await expect(panel.locator("[data-stat-rank-label]")).toHaveText("Rank per person");
    await expect(panel.locator("[data-stat-extra-label]")).toHaveText("World average");
    await expect(page.locator('path.country[data-iso="HRV"]')).toHaveAttribute(
      "aria-label",
      /^Croatia: .* t CO₂ per person in 1990, total .* Mt CO₂$/,
    );
    expect(errors).toEqual([]);
  });

  test("invalid parameters fall back to the defaults", async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto("./?country=XXX&year=3000&metric=gdp&scale=log");
    await expect(page.locator("body.is-ready")).toBeAttached();
    await expect(page.locator("#panel")).toBeHidden();
    await expect(page.locator("#year-slider")).toHaveValue(String(LAST_YEAR));
    await expect(page.locator("#metric-total")).toBeChecked();
    await expect(page.locator("#mode-fixed")).toBeChecked();
    await expect(page).toHaveURL(/\/co2-atlas\/$/);
    expect(errors).toEqual([]);
  });

  test("Back closes the panel and Forward reopens it", async ({ page }) => {
    await page.goto("./?year=1990");
    await expect(page.locator("body.is-ready")).toBeAttached();
    await page.locator('path.country[data-iso="DEU"]').dispatchEvent("click");
    await expect(page.locator("#panel-title")).toHaveText("Germany");
    await expect(page).toHaveURL(/\?country=DEU&year=1990$/);
    await page.goBack();
    await expect(page.locator("#panel")).toBeHidden();
    await expect(page).toHaveURL(/\?year=1990$/);
    await expect(page.locator("#year-slider")).toHaveValue("1990");
    await page.goForward();
    await expect(page.locator("#panel-title")).toHaveText("Germany");
  });

  test("metric toggle switches the legend, panel figures and URL", async ({ page }) => {
    const errors = watchErrors(page);
    const title = page.locator("[data-legend-title]");
    await expect(title).toHaveText("Fossil CO₂ emissions, Mt CO₂");
    const totalLabels = await page.locator("[data-legend-classes] li").allTextContents();
    await page.locator("label[for=metric-percapita]").click();
    await expect(title).toHaveText("Fossil CO₂ emissions per person, t CO₂");
    const perCapitaLabels = await page.locator("[data-legend-classes] li").allTextContents();
    expect(perCapitaLabels).toHaveLength(totalLabels.length);
    expect(perCapitaLabels).not.toEqual(totalLabels);
    expect(perCapitaLabels[0]).toBe("< 0.5");
    await expect(page.locator('[data-legend-status] [data-status="zero"]')).toHaveText("0 t");
    await expect(page).toHaveURL(/\?metric=percapita$/);
    // Relative mode works for per capita too.
    await page.locator("label[for=mode-relative]").click();
    await expect(page.locator("[data-legend-note]")).toContainText(`relative to ${LAST_YEAR}`);
    await expect(page).toHaveURL(/\?metric=percapita&scale=relative$/);
    // Panel: the per-capita figure is emphasised and the rank is per person.
    await page.locator('path.country[data-iso="QAT"]').dispatchEvent("click");
    await expect(page.locator('[data-stat="perCapita"]')).toHaveClass(/is-active/);
    await expect(page.locator("[data-stat-rank]")).toHaveText(/^#[1-3] of /);
    // On phones the bottom sheet covers the legend, so switch the radio directly.
    await page.locator("#metric-total").dispatchEvent("click");
    await expect(page.locator('[data-stat="total"]')).toHaveClass(/is-active/);
    await expect(page.locator("[data-stat-extra-label]")).toHaveText("Share of world");
    expect(errors).toEqual([]);
  });

  test("Copy link copies the current URL and confirms it", async ({ page, context, isMobile }) => {
    test.skip(isMobile, "clipboard permission is checked on desktop");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("./?country=HRV&year=1990&metric=percapita");
    await expect(page.locator("body.is-ready")).toBeAttached();
    const button = page.locator("[data-copy-link]");
    await expect(button).toHaveAccessibleName("Copy link");
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveText("Copied");
    await expect(page.locator("[data-copy-status]")).toHaveText("Link copied to the clipboard.");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(page.url());
    expect(copied).toMatch(/\/co2-atlas\/\?country=HRV&year=1990&metric=percapita$/);
  });
});

test.describe("documentation screenshots", () => {
  // Retina-like mobile screenshots, like the others in docs/screenshots/.
  test.use({ deviceScaleFactor: async ({ isMobile }, use) => use(isMobile ? 2 : 1) });

  test("per-capita view", async ({ page, isMobile }) => {
    await page.goto("./?metric=percapita");
    await expect(page.locator("body.is-ready")).toBeAttached();
    await page.waitForTimeout(1000);
    const name = isMobile ? "mobile-percapita.png" : "desktop-percapita.png";
    await page.screenshot({
      path: fileURLToPath(new URL(`../docs/screenshots/${name}`, import.meta.url)),
    });
  });
});
