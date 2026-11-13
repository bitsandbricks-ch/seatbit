import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, DB_FILE, DISCORD_CLIENT_ID, PORT, SECRET } from "./e2e/env";

/**
 * End-to-end tests (e2e/): a production build on a fresh demo database.
 *
 *   npm run build        # once, after code changes
 *   npm run test:e2e     # seeds the database, starts `next start` and runs the tests
 *
 * See docs/development/testing.md.
 */
export default defineConfig({
  testDir: "e2e",
  // One server and one SQLite file: tests create their own events, but run one at a time to stay predictable.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    locale: "en-GB",
    timezoneId: "Europe/Zurich",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Another browser binary, like scripts/screenshots.ts (default: Playwright's own).
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Mobile-first: the member flows again on a phone.
    { name: "phone", use: { ...devices["Pixel 7"] }, testMatch: /(rsvp|seats)\.spec\.ts$/ },
  ],
  webServer: {
    command: `npx tsx e2e/setup-db.ts && npx next start -p ${PORT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      DATABASE_PATH: DB_FILE,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_SECRET: SECRET,
      TZ: "Europe/Zurich",
      NEXT_TELEMETRY_DISABLED: "1",
      ALLOW_EMAIL_LOGIN: "1",
      // A fake Discord app, so the Discord button shows. The test stops the browser before it reaches Discord.
      DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: "e2e-only",
      // No background jobs or mail while testing.
      REMINDER_INTERVAL_MINUTES: "0",
      BACKUP_INTERVAL_HOURS: "0",
      SMTP_HOST: "",
      SMTP_URL: "",
    },
  },
});
