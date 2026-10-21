import { defineConfig, devices } from "@playwright/test";

// E2E runs against `wrangler pages dev` (static build + Functions + a throwaway
// local D1 created by tests/e2e/prepare-db.mjs). Run `npm run build` first.
const PORT = 8789;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `node tests/e2e/prepare-db.mjs && npx wrangler pages dev dist --ip 127.0.0.1 --port ${PORT} --persist-to .wrangler/e2e`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "flows-chromium", testMatch: /flows\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "flows-iphone-webkit", testMatch: /flows\.spec\.ts/, use: { ...devices["iPhone 14"] } },
    { name: "responsive", testMatch: /responsive\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
});
