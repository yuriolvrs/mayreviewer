import { defineConfig, devices } from "@playwright/test";

// E2E specs live in `e2e/`, not `tests/` — vitest globs `tests/**/*.test.ts`
// and would try to run them in node with no browser.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Reuses a dev server that's already up rather than fighting it for the
  // port — `next dev` refuses to start a second instance on the same folder.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
