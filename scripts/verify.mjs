// Measures the production build and regenerates the documentation images.
//
//   npm run build && npm run verify            (uses Playwright's Chromium)
//   PW_CHANNEL=msedge npm run verify           (uses an installed Edge/Chrome)
//   npm run verify -- --old-url http://127.0.0.1:8765/   (also measure the old project)
//   npm run verify -- --headed --measure-only   (GPU-rasterised window, numbers only:
//                                                 writes docs/verification-headed.json)
//
// Writes docs/verification.json, docs/screenshots/*.png, docs/screenshots/demo.gif
// and public/og-image.png.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
import pngjs from "pngjs";
import { preview } from "vite";

const { GIFEncoder, applyPalette, quantize } = gifenc; // CommonJS packages
const { PNG } = pngjs;

const root = new URL("../", import.meta.url);
const shots = new URL("docs/screenshots/", root);
mkdirSync(shots, { recursive: true });

const args = process.argv.slice(2);
const oldUrl = args.includes("--old-url") ? args[args.indexOf("--old-url") + 1] : null;
const channel = process.env.PW_CHANNEL || undefined;
const headed = args.includes("--headed");
const measureOnly = args.includes("--measure-only");

/** Throttled profile used for the "slow network" load time. */
const SLOW_NETWORK = {
  latency: 70,
  downloadThroughput: (4 * 1024 * 1024) / 8,
  uploadThroughput: (1024 * 1024) / 8,
};

const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const round = (v) => Math.round(v * 100) / 100;
  return {
    n: values.length,
    median: round(pick(0.5)),
    p95: round(pick(0.95)),
    max: round(sorted.at(-1)),
  };
};

const server = await preview({ preview: { port: 4175, strictPort: true, host: "127.0.0.1" } });
const url = "http://127.0.0.1:4175/co2-atlas/";
const browser = await chromium.launch({ channel, headless: !headed });
const report = { date: new Date().toISOString(), browser: channel ?? "chromium", headed, url };

async function ready(page) {
  await page.waitForSelector("body.is-ready", { timeout: 60_000 });
}

// ---------- Transfer size and console errors ----------
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const resources = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
    try {
      const body = await r.body();
      resources.push({
        url: r.url().replace(url, ""),
        bytes: body.length,
        gzip: gzipSync(body).length,
      });
    } catch {
      /* redirects have no body */
    }
  });
  await page.goto(url);
  await ready(page);
  await page.waitForTimeout(500);
  const sum = (filter) =>
    resources
      .filter(filter)
      .reduce((a, r) => ({ bytes: a.bytes + r.bytes, gzip: a.gzip + r.gzip }), {
        bytes: 0,
        gzip: 0,
      });
  report.transfer = {
    data: sum((r) => r.url.startsWith("data/")),
    total: sum(() => true),
    resources: resources.sort((a, b) => b.bytes - a.bytes),
  };
  report.consoleErrors = errors;
  await page.close();
}

// ---------- Load time ----------
async function loadTimes(target, readySelector, throttle) {
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, ...throttle });
    }
    const start = Date.now();
    await page.goto(target);
    await page.waitForSelector(readySelector, { timeout: 180_000, state: "attached" });
    times.push(Date.now() - start);
    await context.close();
  }
  return stats(times);
}
report.loadMs = {
  localhost: await loadTimes(url, "body.is-ready"),
  slow4Mbit: await loadTimes(url, "body.is-ready", SLOW_NETWORK),
  note: "Time from navigation to first interactive map. slow4Mbit: 4 Mbit/s, 70 ms latency, uncompressed (vite preview does not gzip; GitHub Pages does).",
};

/**
 * Real keyboard input on the slider, measured with the Event Timing API: the time from
 * a trusted key press to the next paint (script, style, layout and paint included),
 * grouped per interaction. The browser only reports interactions of >= 16 ms, so
 * everything else counts as "< 16 ms". `noop` presses an arrow key at the end of the
 * range, where nothing changes, as a baseline for this machine and browser.
 */
async function sliderPaintTiming(page, moves, { noop = false } = {}) {
  await page.evaluate(() => {
    window.__slow = new Map();
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.interactionId) continue;
        window.__slow.set(
          e.interactionId,
          Math.max(window.__slow.get(e.interactionId) ?? 0, e.duration),
        );
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: false });
  });
  const slider = page.locator("#year-slider");
  await slider.focus();
  if (noop) await page.keyboard.press("End");
  for (let i = 0; i < moves; i += 1) {
    const key = noop ? "ArrowRight" : i < moves / 2 ? "ArrowLeft" : "ArrowRight";
    await page.keyboard.press(key);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(500);
  const slow = await page.evaluate(() => [...window.__slow.values()].map(Math.round));
  const sorted = [...slow].sort((a, b) => a - b);
  const p = (q) => {
    // interactions not reported were < 16 ms
    const index = Math.floor(q * moves) - (moves - sorted.length);
    return index < 0 ? "<16" : sorted[Math.min(sorted.length - 1, index)];
  };
  return {
    interactions: moves,
    atLeast16ms: slow.length,
    median: p(0.5),
    p95: p(0.95),
    max: sorted.at(-1) ?? "<16",
  };
}

// ---------- Slider timing ----------
async function sliderTiming(page, setup) {
  await setup?.(page);
  return page.evaluate(() => {
    const slider = /** @type {HTMLInputElement} */ (document.getElementById("year-slider"));
    const min = Number(slider.min);
    const max = Number(slider.max);
    const times = [];
    for (let pass = 0; pass < 2; pass += 1) {
      for (let y = max; y >= min; y -= 1) {
        const t0 = performance.now();
        slider.value = String(y);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        times.push(performance.now() - t0);
      }
    }
    return times;
  });
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await ready(page);
  const closed = await sliderTiming(page);
  const open = await sliderTiming(page, async (p) => {
    await p.locator('path.country[data-iso="CHN"]').dispatchEvent("click");
    await p.waitForTimeout(1000);
  });
  report.sliderMs = {
    panelClosed: stats(closed),
    panelOpen: stats(open),
    note: "performance.now() around one synchronous 'input' event (store update + render), 150 moves each.",
  };
  report.sliderToPaint = { panelOpen: await sliderPaintTiming(page, 60) };
  await page.locator("[data-panel-close]").click();
  await page.waitForTimeout(700);
  report.sliderToPaint.panelClosed = await sliderPaintTiming(page, 60);
  report.sliderToPaint.baselineNoChange = await sliderPaintTiming(page, 30, { noop: true });
  // Same measurements with the per-capita metric on the map.
  await page.evaluate(() => window.__co2.store.set({ metric: "perCapita" }));
  await page.waitForTimeout(700);
  report.sliderMs.perCapitaPanelClosed = stats(await sliderTiming(page));
  report.sliderToPaint.perCapitaPanelClosed = await sliderPaintTiming(page, 60);
  report.sliderToPaint.note =
    "Event Timing API, trusted key presses, ms from input to next paint per interaction. Headless browsers rasterise in software, so paint is slower than on a desktop GPU; compare with the baseline.";
  await page.close();
}

// ---------- Old project (optional) ----------
if (oldUrl) {
  report.old = { url: oldUrl, loadMs: { localhost: await loadTimes(oldUrl, "path.country") } };
  report.old.loadMs.slow4Mbit = await loadTimes(oldUrl, "path.country", SLOW_NETWORK);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(oldUrl);
  await page.waitForSelector("path.country", { state: "attached" });
  report.old.sliderToPaint = await sliderPaintTiming(page, 60);
  report.old.sliderMs = stats(
    await page.evaluate(() => {
      const slider = /** @type {HTMLInputElement} */ (document.getElementById("year-slider"));
      const times = [];
      for (let i = Number(slider.max); i >= 0; i -= 1) {
        const t0 = performance.now();
        slider.value = String(i);
        slider.dispatchEvent(new Event("input"));
        times.push(performance.now() - t0);
      }
      return times;
    }),
  );
  await page.close();
}

// ---------- Screenshots ----------
if (measureOnly) {
  await finish("docs/verification-headed.json");
  process.exit(process.exitCode ?? 0);
}

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: {
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  },
};
for (const [name, options] of Object.entries(VIEWPORTS)) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(url);
  await ready(page);
  const set = (patch) => page.evaluate((p) => window.__co2.store.set(p), patch);
  const snap = async (state) => {
    await page.waitForTimeout(900);
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-${state}.png`, shots)) });
  };
  await snap("2024");
  await set({ year: 1950 });
  await snap("1950");
  await set({ year: 2024 });
  await page.locator("label[for=mode-relative]").click();
  await snap("relative");
  await page.locator("label[for=mode-fixed]").click();
  await set({ selected: name === "desktop" ? "CHN" : "DEU" });
  await snap("selected");
  await context.close();
}

// ---------- Open Graph image ----------
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.goto(url);
  await ready(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: fileURLToPath(new URL("public/og-image.png", root)) });
  await page.close();
}

// ---------- Demo GIF ----------
{
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(url);
  await ready(page);
  const gif = GIFEncoder();
  let palette = null;
  const frame = async (delay) => {
    const png = PNG.sync.read(await page.screenshot());
    palette ??= quantize(png.data, 256);
    gif.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay });
  };
  for (let year = 1950; year <= 2024; year += 3) {
    await page.evaluate((y) => window.__co2.store.set({ year: y }), year);
    await frame(year === 1950 ? 900 : 160);
  }
  await page.evaluate(() => window.__co2.store.set({ year: 2024 }));
  await frame(1200);
  await page.locator('path.country[data-iso="CHN"]').dispatchEvent("click");
  await page.waitForTimeout(900);
  await frame(2500);
  gif.finish();
  writeFileSync(new URL("demo.gif", shots), gif.bytes());
  report.gifBytes = gif.bytes().length;
  await page.close();
}

await finish("docs/verification.json");

async function finish(file) {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  report.dataFiles = JSON.parse(
    readFileSync(new URL("public/data/manifest.json", root), "utf8"),
  ).outputs;
  writeFileSync(new URL(file, root), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        ...report,
        transfer: report.transfer && { data: report.transfer.data, total: report.transfer.total },
      },
      null,
      2,
    ),
  );
  if (report.consoleErrors.length) {
    console.error("Console errors:", report.consoleErrors);
    process.exitCode = 1;
  }
}
