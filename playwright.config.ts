import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Test can run both browser E2E tests and pure Node "unit" tests.
 * - tests/unit: fast, no DB required
 * - tests/app: CLI smoke tests (no DB required)
 * - tests/app/full-run: optional integration test that needs a running DB
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],

  // Base URL is here for future UI/E2E work; unit tests won't use it.
  use: {
    headless: true,
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
