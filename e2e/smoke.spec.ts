import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// Every page loads for the people who may see it: no error status, no crash in the browser.
// A cheap net under all the feature tests, run on the demo data.
const LAN = "demo-lan-lakeside";
const CLAN = "/clans/pixel-pirates";

const MEMBER_PAGES = [
  "/",
  "/clans",
  CLAN,
  `${CLAN}/stats`,
  `${CLAN}/members/demo-ben`,
  `/lans/${LAN}`,
  "/lans/demo-lan-mountain",
  "/lans/demo-lan-retro",
  "/profile",
  "/changelog",
  "/terms",
  "/privacy",
];

const LEAD_PAGES = [
  `/lans/${LAN}/manage`,
  ...["seats", "attendees", "missing", "emergency", "chat", "settings"].map((t) => `/lans/${LAN}/manage?tab=${t}`),
  "/lans/demo-lan-lakeside-next/manage",
  `${CLAN}/settings`,
  `${CLAN}/lans/new`,
  `${CLAN}/lans/new?type=demo-type-lakeside`,
  `${CLAN}/types/new`,
  `${CLAN}/types/demo-type-lakeside`,
  `${CLAN}/payments/new`,
  `${CLAN}/payments/demo-charge-dues`,
];

const ADMIN_PAGES = [
  "/admin",
  "/admin/reports",
  "/admin/stats",
  "/admin/health",
  "/admin/log",
  "/admin/backups",
  `/admin/lans/${LAN}`,
  ...["mail", "discord", "general", "automation", "maintenance", "legal", "billing", "connect", "templates", "server"].map(
    (t) => `/admin/settings?tab=${t}`,
  ),
];

async function visitAll(page: Page, urls: string[]) {
  const crashes: string[] = [];
  page.on("pageerror", (e) => crashes.push(`${page.url()}: ${e.message}`));
  for (const url of urls) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBeLessThan(400);
    await expect(page.getByRole("main").first(), url).toBeVisible();
    await expect(page.getByText(/Application error|Internal Server Error/), url).toHaveCount(0);
  }
  expect(crashes).toEqual([]);
}

test.describe("smoke", () => {
  test("a member can open every member page", async ({ as }) => {
    await visitAll(await as("anna"), MEMBER_PAGES);
  });

  test("a lead can open every lead page", async ({ as }) => {
    await visitAll(await as("alex"), LEAD_PAGES);
  });

  test("the platform owner can open every admin page", async ({ as }) => {
    await visitAll(await as("alex"), ADMIN_PAGES);
  });
});
