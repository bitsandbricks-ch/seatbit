import type { Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { db, expect, signInById, test } from "./fixtures";

// Every page loads for the people who may see it: no error status, no crash in the browser, and
// every visible button, link and field has a name for screen readers.
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
  // Tabs switch on the client, so each one is loaded once to check what it shows.
  ...["seats", "attendees", "trip", "travel", "gear", "games", "costs"].map((t) => `/lans/${LAN}?tab=${t}`),
  "/lans/demo-lan-mountain",
  "/lans/demo-lan-retro",
  "/profile",
  "/changelog",
  "/terms",
  "/privacy",
];

// Someone who just signed up and isn't in any clan yet: the empty states.
const NEWCOMER_PAGES = ["/", "/clans", "/profile", ...["notifications", "data"].map((t) => `/profile?tab=${t}`), "/changelog", "/donate"];

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

/**
 * Visible buttons, links and fields that a screen reader can't name: no text, no aria-label, no
 * <label>. A placeholder alone doesn't count, it disappears once someone types.
 */
function unnamed(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const describe = (el: Element) =>
      [el.tagName.toLowerCase(), ...["name", "type", "placeholder", "href", "class"].map((a) => el.getAttribute(a) && `${a}=${el.getAttribute(a)!.slice(0, 50)}`)]
        .filter(Boolean)
        .join(" ");
    const out: string[] = [];
    for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
      if (!shown(el)) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || "").trim();
      if (!name && !el.getAttribute("aria-labelledby") && !el.querySelector("img[alt]:not([alt=''])")) out.push(describe(el));
    }
    for (const el of document.querySelectorAll("input:not([type=hidden]), select, textarea")) {
      // aria-hidden: the date picker's form value, which its own button names.
      if (!shown(el) || el.closest("[aria-hidden=true]")) continue;
      const labelled =
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.getAttribute("title") ||
        el.closest("label") ||
        (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      if (!labelled) out.push(describe(el));
    }
    return out;
  });
}

async function visitAll(page: Page, urls: string[]) {
  const crashes: string[] = [];
  const nameless: string[] = [];
  page.on("pageerror", (e) => crashes.push(`${page.url()}: ${e.message}`));
  for (const url of urls) {
    const res = await page.goto(url);
    expect(res?.status(), url).toBeLessThan(400);
    await expect(page.getByRole("main").first(), url).toBeVisible();
    await expect(page.getByText(/Application error|Internal Server Error/), url).toHaveCount(0);
    for (const el of await unnamed(page)) nameless.push(`${url}: ${el}`);
  }
  expect(crashes).toEqual([]);
  expect(nameless).toEqual([]);
}

test.describe("smoke", () => {
  test("a member can open every member page", async ({ as }) => {
    await visitAll(await as("anna"), MEMBER_PAGES);
  });

  test("a newcomer without a clan can open every page they have", async ({ browser }) => {
    const id = `e2e-newcomer-${Date.now()}`;
    db()
      .insert(schema.user)
      .values({ id, name: "Nora Neu", firstName: "Nora", lastName: "Neu", email: `${id}@example.com`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
      .run();
    const context = await browser.newContext();
    try {
      await signInById(context, id);
      const page = await context.newPage();
      await visitAll(page, NEWCOMER_PAGES);
      // An event of a clan they're not in shows how to get in, not the event itself.
      await page.goto(`/lans/${LAN}`);
      await expect(page.getByRole("main").first()).toBeVisible();
      await expect(page.getByText(/Application error|Internal Server Error/)).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Seats" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Ask to join" })).toBeVisible();
    } finally {
      await context.close();
      db().delete(schema.user).where(eq(schema.user.id, id)).run();
    }
  });

  test("a lead can open every lead page", async ({ as }) => {
    await visitAll(await as("alex"), LEAD_PAGES);
  });

  test("old links redirect on the server, not after showing another page", async ({ request }) => {
    for (const [from, to] of [
      [`/admin/lans/${LAN}`, `/lans/${LAN}/manage`],
      [`${CLAN}/stats`, `${CLAN}?tab=stats`],
    ]) {
      const res = await request.get(from, { maxRedirects: 0 });
      expect(res.status(), from).toBe(308);
      expect(res.headers().location, from).toBe(to);
    }
  });

  test("the platform owner can open every admin page", async ({ as }) => {
    await visitAll(await as("alex"), ADMIN_PAGES);
  });
});
