// @ts-check
import { defineConfig } from "vitest/config";

// Served from https://kiko4902.github.io/co2-atlas/
export default defineConfig({
  base: "/co2-atlas/",
  build: {
    target: "es2022",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
