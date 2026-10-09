// @ts-check
import { defineConfig } from "@playwright/test";

const PORT = 4173;
const baseURL = `http://127.0.0.1:${PORT}/co2-atlas/`;

/**
 * End-to-end tests against the production build (`vite preview`).
 * Locally, PW_CHANNEL=msedge (or chrome) uses an installed browser instead of
 * downloading Playwright's Chromium.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false, // always test a fresh build
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
