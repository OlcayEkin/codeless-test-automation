import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// End-to-end tests use their own database and credentials, never your dev data.
export const E2E_USER = { email: "e2e@example.com", password: "e2e-Password-123" };
const E2E_ENV = { DATABASE_URL: "file:./data/e2e.db", RESULTS_DIR: "results-e2e" };

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npx tsx scripts/prepare-e2e-db.ts && npx next dev --port ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...E2E_ENV,
        SESSION_SECRET: "e2e-only-session-secret-that-is-long-enough-123",
        SEED_ADMIN_EMAIL: E2E_USER.email,
        SEED_ADMIN_PASSWORD: E2E_USER.password,
        NEXT_DIST_DIR: ".next-e2e",
        // Tests must not depend on, or spend credits with, the external Jev service.
        JEV_DISABLED: "1",
      },
    },
    {
      // Starts after the web server, so the database is ready.
      command: "npx tsx scripts/worker.ts",
      wait: { stdout: /Worker ready/ },
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...E2E_ENV, WORKER_POLL_MS: "300" },
    },
  ],
});
