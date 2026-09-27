import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT, STRIPE_EMULATOR_PORT } from "./tests/e2e/e2e-env";

const baseURL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node tests/e2e/stripe-emulator.mjs",
      url: `http://localhost:${STRIPE_EMULATOR_PORT}/health`,
      env: { ...E2E_ENV, E2E_STRIPE_PORT: String(STRIPE_EMULATOR_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // Production build: run `npm run build` first (CI does).
      command: `npx next start --port ${E2E_PORT}`,
      url: `${baseURL}/api/health`,
      env: E2E_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
