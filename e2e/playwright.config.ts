import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30 * 1000,
  expect: {
    timeout: 8000,
  },
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: process.env.BASE_URL || "https://d1soslo0efb36p.cloudfront.net",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      Accept: "application/json",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
