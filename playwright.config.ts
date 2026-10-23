import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/web",
  outputDir: ".local-validation/browser-results",
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: ".local-validation/browser-report", open: "never" },
    ],
  ],
  use: {
    baseURL: process.env.WEB_TEST_URL ?? "http://localhost:3030",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
  ],
});
