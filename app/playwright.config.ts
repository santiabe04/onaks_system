import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the compiled app (`next start`) and a database with
// the seed demo (SEED_DEMO=true). They run one at a time: they share the database and
// each flow leaves data that the next one can see. See e2e/README.md.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL,
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Without E2E_BASE_URL it starts the already compiled app (run npm run build first).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start",
        url: `${baseURL}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // SMTP to a closed port: the email notices stay in the queue with their error.
        env: {
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "1",
          SMTP_FROM: "pedidos@onaks.local",
        },
      },
});
