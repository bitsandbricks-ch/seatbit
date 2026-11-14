/**
 * Regenerates the screenshots in docs/screenshots/ from the demo data
 * (scripts/seed-demo.ts), so the README and the docs always show the current UI.
 *
 *   npm run build          # once, after code changes
 *   npm run screenshots    # fresh demo database + `next start` on port 3100
 *
 * Options (env):
 *   SCREENSHOTS_ONLY=phone-event,desktop-admin   only these shots
 *   SCREENSHOTS_DEV=1                             use `next dev` instead of a production build
 *   CHROMIUM_PATH=/path/to/chrome                 browser binary (default: Playwright's)
 *
 * Everything runs at a fixed "today" (NOW below), so the images only change
 * when the UI does. Phones are 390 px wide at 2x, desktops 1440 px at 1x. Signing in skips
 * Discord: the script creates sessions for the demo users straight in the
 * database and sets the signed session cookie, so the login page looks like
 * production (Discord only).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { PNG } from "pngjs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const PORT = 3100;
const DISCORD_PORT = 3101;
const OPS_CHANNEL = "1234567890123456781";
const ANNOUNCE_CHANNEL = "1234567890123456782";
const BASE = `http://localhost:${PORT}`;
const SECRET = "screenshots-only-not-a-real-secret-0123456789";
/**
 * The demo world's "today". Seed, server and browser all run at this time, so
 * the screenshots only change when the UI changes. Bump it once a year or so.
 */
const NOW = "2026-11-12T10:00:00+01:00";

const LAKESIDE = "/lans/demo-lan-lakeside";
const MOUNTAIN = "/lans/demo-lan-mountain";
const CLAN = "/clans/pixel-pirates";
const RETRO = "/lans/demo-lan-retro";
const DRAFT = "/lans/demo-lan-lakeside-next";

type Who = "anon" | "alex" | "anna" | "sara" | "oliver";
type Device = "phone" | "desktop";
type Shot = {
  name: string;
  who: Who;
  path: string;
  /** Runs after the page loaded, e.g. to open a seat's details. */
  act?: (page: Page) => Promise<void>;
  /** Capture the whole page instead of the first screen. */
  full?: boolean;
  /** Browser language; the demo users have no saved language, so this picks the UI language. */
  lang?: "de";
  /** Device colour scheme; the demo users keep the "System" theme, so this picks light or dark. */
  theme?: "light";
};

/**
 * The sign-in link the bot's /claim gives Sara for her guest (same format as
 * discordClaimTicket in src/lib/guest-claim.ts). Her Discord id comes from the seed's
 * --discord accounts (index 15 in PEOPLE). Expires long after NOW, so the image is stable.
 */
function discordClaimTicket() {
  const t = { d: "100000000000001015", g: "demo-guestsara", c: "demo-clan", m: "name", exp: Date.parse(NOW) + 3650 * 86400_000 };
  const data = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${data}.${crypto.createHmac("sha256", SECRET).update(`discord-claim:${data}`).digest("base64url")}`;
}

/** The Health page shows live numbers (uptime, memory, paths, commit); pin them so the image only changes with the UI. */
async function pinHealth(page: Page) {
  await page.evaluate(() => {
    const fixed: Record<string, string> = {
      commit: "0123456789ab",
      node: "v22.11.0",
      started: "Tue 10.11.2026, 06:00",
      file: "/data/seatbit.db",
      size: "1.4 MB + 96 KB WAL",
      runs: " · 12 runs",
      job: "Last OK Thu 12.11.2026, 09:59 (1 minute ago)",
      since: "Since the server started (Tue 10.11.2026, 06:00). Runs started from the cron URL count too.",
    };
    document.querySelectorAll<HTMLElement>("[data-volatile]").forEach((el) => {
      const v = fixed[el.dataset.volatile ?? ""];
      // Jobs that never ran keep their "Not run yet".
      if (v !== undefined && !(el.dataset.volatile === "job" && el.textContent?.startsWith("Not"))) el.textContent = v;
    });
    const tiles: [string, string][] = [
      ["0123456", "v22.11.0"],
      ["2 d 4 h", "Tue 10.11.2026, 06:00"],
      ["1.5 MB", "96 KB of it in the WAL"],
      ["182 MB", "linux x64"],
    ];
    document.querySelectorAll("[data-volatile-tiles] > div").forEach((tile, i) => {
      const [, value, sub] = tile.children;
      if (tiles[i] && value) value.textContent = tiles[i][0];
      if (tiles[i] && sub) sub.textContent = tiles[i][1];
    });
  });
}

/** Fills in and saves a planned maintenance, two days after the demo's "today". */
async function setMaintenance(page: Page) {
  await page.locator("#maintenance-message").fill("Seatbit moves to a new server. Sign-ups and seat picks pause for about an hour.");
  const dates = page.locator('input[type="text"][title]');
  await dates.nth(0).fill("14.11.2026 22:00");
  await dates.nth(0).press("Enter");
  await dates.nth(1).fill("14.11.2026 23:00");
  await dates.nth(1).press("Enter");
  await page.getByRole("button", { name: "Save" }).click();
  // The "Saved." toast would cover part of the page; close it.
  await page.locator("ol[aria-live] li").first().waitFor();
  await page.locator("ol[aria-live] button").first().click();
  await page.mouse.move(0, 0);
}

const seat = (label: string) => async (page: Page) => {
  await page.locator(`[aria-label^="Seat ${label},"], [aria-label="Seat ${label}"]`).first().click();
  // Phones: show the whole seat card below the sticky header and tabs.
  await page.evaluate(() => {
    if (window.innerWidth > 640) return;
    const grid = document.querySelector("[data-seat-grid]");
    const card = grid?.parentElement?.closest("section, [class*='rounded-card']") ?? grid;
    if (card) window.scrollTo({ top: card.getBoundingClientRect().top + window.scrollY - 140, behavior: "instant" });
  });
  await page.waitForTimeout(300);
};

const openDisplayMenu = async (page: Page) => {
  await page.getByRole("button", { name: "Language and theme" }).click();
  await page.waitForTimeout(200);
};

/** Scrolls a card (by its id) to just below the sticky header. */
const scrollTo = (id: string) => async (page: Page) => {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - (window.innerWidth > 640 ? 116 : 112), behavior: "instant" });
  }, id);
  await page.waitForTimeout(200);
};

// Device comes from the name prefix.
const SHOTS: Shot[] = [
  // Signed out
  { name: "phone-login", who: "anon", path: "/login" },
  // A shared event link opened while signed out, and the link preview chat apps show for it.
  { name: "phone-event-shared", who: "anon", path: LAKESIDE },
  {
    name: "desktop-event-link-preview",
    who: "anon",
    path: `${LAKESIDE}/opengraph-image/card`,
    act: (page) => page.setViewportSize({ width: 1200, height: 630 }),
  },
  { name: "desktop-login", who: "anon", path: "/login" },

  // A member (Anna) on her phone
  { name: "phone-lans", who: "anna", path: "/", full: true },
  { name: "phone-event", who: "anna", path: LAKESIDE, full: true },
  { name: "phone-seat-plan", who: "anna", path: `${LAKESIDE}?tab=seats`, act: seat("F10") },
  { name: "phone-seat-picking", who: "anna", path: `${MOUNTAIN}?tab=seats`, act: seat("A2") },
  { name: "phone-checklist-picking", who: "anna", path: MOUNTAIN },
  { name: "phone-event-attendees", who: "anna", path: `${LAKESIDE}?tab=attendees`, full: true },
  { name: "phone-travel", who: "anna", path: `${LAKESIDE}?tab=travel`, full: true },
  { name: "phone-packing-list", who: "anna", path: `${LAKESIDE}?tab=gear`, full: true },
  { name: "phone-games", who: "anna", path: `${LAKESIDE}?tab=games`, full: true },
  { name: "phone-food", who: "anna", path: `${LAKESIDE}?tab=food`, full: true },
  { name: "phone-costs", who: "anna", path: `${LAKESIDE}?tab=costs`, full: true },
  { name: "phone-interest", who: "anna", path: RETRO, full: true },
  { name: "phone-waitlist", who: "sara", path: `${MOUNTAIN}?tab=attendees`, full: true },
  { name: "phone-clans", who: "anna", path: "/clans" },
  {
    name: "phone-report-clan",
    who: "anna",
    path: "/clans/cheap-keys-club",
    full: true,
    act: async (page) => {
      await page.getByRole("button", { name: "Report this clan" }).click();
      await page.getByLabel("Spam or advertising").check();
      await page.waitForTimeout(200);
    },
  },
  { name: "phone-clan", who: "anna", path: CLAN, full: true },
  { name: "phone-clan-payments", who: "anna", path: `${CLAN}?tab=payments`, full: true },
  { name: "phone-profile", who: "anna", path: "/profile", full: true },
  { name: "phone-profile-lans", who: "anna", path: "/profile?tab=lans", full: true },
  { name: "phone-profile-emergency", who: "anna", path: "/profile?tab=emergency" },
  { name: "phone-profile-notifications", who: "anna", path: "/profile?tab=notifications", full: true },
  {
    // The toast after a save (src/components/toast.tsx).
    name: "phone-toast",
    who: "anna",
    path: "/profile?tab=notifications",
    act: async (page) => {
      // Notifications save as soon as a box is ticked; tick it back afterwards for the other shots.
      const box = page.getByRole("checkbox", { name: /Discord DMs/ });
      await box.uncheck();
      await page.locator("ol[aria-live] li").first().waitFor();
      await box.check();
      // Let the slide-in finish.
      await page.waitForTimeout(400);
    },
  },
  // German: same pages with a Swiss German browser.
  { name: "phone-event-de", who: "anna", path: LAKESIDE, full: true, lang: "de" },
  { name: "phone-profile-de", who: "anna", path: "/profile", lang: "de" },
  { name: "phone-display-menu", who: "anna", path: "/", act: openDisplayMenu },
  { name: "phone-whats-new", who: "anna", path: "/changelog" },
  { name: "phone-lans-light", who: "anna", path: "/", theme: "light" },
  { name: "phone-event-light", who: "anna", path: LAKESIDE, full: true, theme: "light" },
  { name: "phone-seat-plan-light", who: "anna", path: `${LAKESIDE}?tab=seats`, act: seat("F10"), theme: "light" },
  { name: "phone-member-profile", who: "anna", path: `${CLAN}/members/demo-chiara`, full: true },
  {
    name: "phone-profile-delete",
    who: "anna",
    path: "/profile?tab=data",
    act: async (page) => {
      await page.getByRole("button", { name: "Delete my account…" }).click();
      await page.evaluate(() => {
        const h = [...document.querySelectorAll("h2, h3")].find((e) => e.textContent === "Your data");
        if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 150, behavior: "instant" });
      });
      await page.waitForTimeout(300);
    },
  },

  // Sara joined, but the leads had added her as a guest already
  { name: "phone-clan-claim", who: "sara", path: `${CLAN}/claim`, full: true },
  // ... and pressed "That's me" after /claim on Discord before she had an account
  { name: "phone-discord-claim", who: "sara", path: `/claim/discord/${discordClaimTicket()}` },

  // A lead (Alex) on the phone
  { name: "phone-manage", who: "alex", path: `${LAKESIDE}/manage`, full: true },
  { name: "phone-manage-missing", who: "alex", path: `${LAKESIDE}/manage?tab=missing` },
  { name: "phone-manage-emergency", who: "alex", path: `${LAKESIDE}/manage?tab=emergency`, full: true },
  { name: "phone-manage-seats", who: "alex", path: `${LAKESIDE}/manage?tab=seats`, act: seat("F12") },
  {
    name: "phone-date-picker",
    who: "alex",
    path: `${CLAN}/lans/new`,
    act: async (page) => {
      await page.locator('button[aria-haspopup="dialog"]').first().click();
      await page.waitForTimeout(300);
    },
  },

  // Desktop, as Alex (platform admin, clan admin and lead)
  { name: "desktop-lans", who: "alex", path: "/" },
  { name: "desktop-lans-de", who: "alex", path: "/", lang: "de" },
  { name: "desktop-event", who: "alex", path: LAKESIDE },
  { name: "desktop-event-light", who: "alex", path: LAKESIDE, theme: "light" },
  { name: "desktop-display-menu-light", who: "alex", path: LAKESIDE, act: openDisplayMenu, theme: "light" },
  { name: "desktop-event-seats", who: "alex", path: `${LAKESIDE}?tab=seats`, act: seat("F9") },
  { name: "desktop-event-attendees", who: "alex", path: `${LAKESIDE}?tab=attendees` },
  { name: "desktop-games", who: "alex", path: `${LAKESIDE}?tab=games` },
  { name: "desktop-food", who: "alex", path: `${LAKESIDE}?tab=food`, full: true },
  { name: "desktop-costs", who: "alex", path: `${LAKESIDE}?tab=costs`, full: true },
  { name: "desktop-manage", who: "alex", path: `${LAKESIDE}/manage` },
  { name: "desktop-manage-light", who: "alex", path: `${LAKESIDE}/manage`, theme: "light" },
  { name: "desktop-manage-de", who: "alex", path: `${LAKESIDE}/manage`, lang: "de" },
  { name: "desktop-clan-stats-de", who: "alex", path: `${CLAN}/stats`, lang: "de" },
  { name: "phone-lead-checklist", who: "alex", path: `${MOUNTAIN}/manage` },
  { name: "phone-lead-tasks", who: "alex", path: `${LAKESIDE}/manage`, act: scrollTo("lead-tasks") },
  { name: "desktop-lead-tasks", who: "alex", path: `${LAKESIDE}/manage`, act: scrollTo("lead-tasks") },
  { name: "desktop-manage-attendees", who: "alex", path: `${LAKESIDE}/manage?tab=attendees` },
  { name: "desktop-manage-waitlist", who: "alex", path: `${MOUNTAIN}/manage?tab=attendees` },
  { name: "desktop-manage-missing", who: "alex", path: `${LAKESIDE}/manage?tab=missing`, full: true },
  { name: "desktop-manage-emergency", who: "alex", path: `${LAKESIDE}/manage?tab=emergency` },
  { name: "desktop-manage-seats", who: "alex", path: `${LAKESIDE}/manage?tab=seats`, act: seat("F12") },
  { name: "desktop-manage-chat", who: "alex", path: `${LAKESIDE}/manage?tab=chat` },
  { name: "desktop-manage-settings", who: "alex", path: `${LAKESIDE}/manage?tab=settings`, full: true },
  { name: "desktop-new-event", who: "alex", path: `${CLAN}/lans/new` },
  { name: "desktop-event-draft", who: "alex", path: `${DRAFT}/manage` },
  { name: "desktop-interest", who: "anna", path: `${RETRO}?tab=attendees` },
  { name: "desktop-interest-manage", who: "alex", path: `${RETRO}/manage` },
  { name: "desktop-clan", who: "alex", path: CLAN },
  { name: "desktop-clan-events", who: "alex", path: `${CLAN}?tab=events` },
  { name: "phone-clan-guests", who: "alex", path: `${CLAN}/settings?tab=guests`, full: true },
  { name: "desktop-clan-stats", who: "alex", path: `${CLAN}/stats` },
  { name: "desktop-clan-settings", who: "alex", path: `${CLAN}/settings` },
  { name: "desktop-clan-support", who: "alex", path: "/clans/lag-legends/settings" },
  { name: "desktop-clan-members", who: "alex", path: `${CLAN}/settings?tab=members` },
  { name: "desktop-member-role", who: "alex", path: `${CLAN}/members/demo-chiara` },
  { name: "desktop-clan-guests", who: "alex", path: `${CLAN}/settings?tab=guests` },
  { name: "desktop-clan-discord", who: "alex", path: `${CLAN}/settings?tab=chat` },
  { name: "desktop-lan-types", who: "alex", path: `${CLAN}/settings?tab=types` },
  { name: "desktop-lan-type-edit", who: "alex", path: `${CLAN}/types/demo-type-lakeside` },
  { name: "desktop-lan-type-tasks", who: "alex", path: `${CLAN}/types/demo-type-lakeside`, act: scrollTo("contacts") },
  { name: "desktop-clan-audit-log", who: "alex", path: `${CLAN}/settings?tab=log` },
  { name: "desktop-clan-payments", who: "alex", path: `${CLAN}/settings?tab=payments` },
  { name: "desktop-charge", who: "alex", path: `${CLAN}/payments/demo-charge-tickets` },
  { name: "desktop-new-charge", who: "alex", path: `${CLAN}/payments/new?lan=demo-lan-lakeside`, full: true },
  { name: "desktop-admin-audit-log", who: "alex", path: "/admin/log" },
  { name: "desktop-profile", who: "alex", path: "/profile" },
  { name: "desktop-admin", who: "alex", path: "/admin" },
  { name: "desktop-admin-mail", who: "alex", path: "/admin/settings?tab=mail" },
  { name: "desktop-admin-discord", who: "alex", path: "/admin/settings?tab=discord" },
  { name: "desktop-admin-legal", who: "alex", path: "/admin/settings?tab=legal", full: true },
  { name: "desktop-admin-billing", who: "alex", path: "/admin/settings?tab=billing", full: true },
  { name: "desktop-admin-templates", who: "alex", path: "/admin/settings?tab=templates" },
  { name: "desktop-admin-backups", who: "alex", path: "/admin/backups", full: true },
  { name: "desktop-admin-usage", who: "alex", path: "/admin/stats", full: true },
  { name: "phone-admin-usage", who: "alex", path: "/admin/stats" },
  { name: "desktop-donate", who: "alex", path: "/donate" },
  { name: "phone-donate", who: "anna", path: "/donate", full: true },
  { name: "desktop-admin-donations", who: "alex", path: "/admin/donations" },
  // Platform moderator (Oliver): the report queue and the admin page without settings.
  { name: "desktop-admin-reports", who: "oliver", path: "/admin/reports" },
  { name: "desktop-admin-moderator", who: "oliver", path: "/admin", full: true },
  { name: "desktop-privacy", who: "alex", path: "/privacy" },
  {
    name: "desktop-admin-ops",
    who: "alex",
    path: "/admin/settings?tab=discord",
    act: async (page) => {
      await page.getByRole("heading", { name: "Platform Discord" }).evaluate((h) => window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 150, behavior: "instant" }));
    },
  },
  { name: "desktop-admin-health", who: "alex", path: "/admin/health", act: pinHealth, full: true },
  // These two set the maintenance banner, so they stay last: every later page would show it.
  { name: "desktop-admin-maintenance", who: "alex", path: "/admin/settings?tab=maintenance", act: setMaintenance },
  { name: "phone-maintenance-banner", who: "anna", path: "/" },
];

const DEVICES: Record<Device, { viewport: { width: number; height: number }; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean }> = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

async function main() {
  const only = process.env.SCREENSHOTS_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const shots = only?.length ? SHOTS.filter((s) => only.includes(s.name)) : SHOTS;
  if (!shots.length) throw new Error(`No shots match SCREENSHOTS_ONLY=${process.env.SCREENSHOTS_ONLY}`);

  const dev = process.env.SCREENSHOTS_DEV === "1";
  if (!dev && !fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `npm run build` first (or set SCREENSHOTS_DEV=1).");
  }

  // Fresh demo database in a temp dir.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seatbit-shots-"));
  const dbFile = path.join(dir, "seatbit.db");
  const env = {
    ...process.env,
    DATABASE_PATH: dbFile,
    BETTER_AUTH_URL: BASE,
    BETTER_AUTH_SECRET: SECRET,
    TZ: "Europe/Zurich",
    PORT: String(PORT),
    NEXT_TELEMETRY_DISABLED: "1",
    SEATBIT_FAKE_NOW: NOW,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require "${path.join(ROOT, "scripts", "fake-now.cjs")}"`].filter(Boolean).join(" "),
    REMINDER_INTERVAL_MINUTES: "0",
    // Backups go to the temp dir; the newest demo backup is recent, so the scheduler doesn't add one.
    BACKUP_DIR: path.join(dir, "backups"),
    BACKUP_INTERVAL_HOURS: "24",
    // Fake Discord app, so the login button and Discord settings show up. Nothing talks to Discord.
    DISCORD_CLIENT_ID: "1234567890123456789",
    DISCORD_CLIENT_SECRET: "screenshots-only",
    DISCORD_BOT_TOKEN: "screenshots-only-not-a-real-token",
    DISCORD_PUBLIC_KEY: "0".repeat(64),
    // A tiny stand-in for Discord's API (fakeDiscord below), so the Health page shows a working bot.
    DISCORD_API_BASE: `http://127.0.0.1:${DISCORD_PORT}`,
    OPS_DISCORD_CHANNEL: OPS_CHANNEL,
    ANNOUNCE_DISCORD_CHANNEL: ANNOUNCE_CHANNEL,
    // Example operator, so the legal pages look like a configured instance.
    LEGAL_OPERATOR_NAME: "Example Gaming Club",
    LEGAL_OPERATOR_ADDRESS: "Example Street 1, 6000 Lucerne, Switzerland",
    LEGAL_CONTACT_EMAIL: "hello@example.com",
    LEGAL_HOSTING_LOCATION: "Switzerland",
    LEGAL_GOVERNING_LAW: "Swiss law",
    // Supporter payments on, with fake Stripe values. Prices can't be fetched, so buttons show their fallback labels.
    BILLING_ENABLED: "true",
    // Not shaped like a real key, so secret scanners (Trivy in the Security workflow) stay quiet.
    STRIPE_SECRET_KEY: "screenshots-only-not-a-key",
    STRIPE_WEBHOOK_SECRET: "whsec_screenshots_only",
    STRIPE_PRICE_ANNUAL: "price_screenshotsAnnual",
    STRIPE_PRICE_MONTHLY: "price_screenshotsMonthly",
    DONATIONS_ENABLED: "true",
    ALLOW_EMAIL_LOGIN: "",
    SMTP_HOST: "",
    SMTP_URL: "",
  };

  run("npx", ["tsx", "scripts/seed-demo.ts", "--discord"], env, true);
  const sessions = createSessions(dbFile, ["alex", "anna", "sara", "oliver"]);
  demoBackups(dbFile, path.join(dir, "backups"));

  // Own process group, so stopping it also stops the Next.js worker processes.
  const server = spawn(path.join(ROOT, "node_modules", ".bin", "next"), [dev ? "dev" : "start", "-p", String(PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let log = "";
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));
  let browser: Browser | undefined;
  const discord = fakeDiscord();
  try {
    await waitForServer(server, () => log);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    fs.mkdirSync(OUT, { recursive: true });
    if (!only?.length) {
      // Full run: drop shots that aren't in the list any more.
      const keep = new Set(SHOTS.map((s) => `${s.name}.png`));
      for (const f of fs.readdirSync(OUT)) if (f.endsWith(".png") && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
    }
    let changed = 0;

    const contexts = new Map<string, BrowserContext>();
    for (const shot of shots) {
      const device: Device = shot.name.startsWith("phone-") ? "phone" : "desktop";
      const key = `${shot.who}:${device}:${shot.lang ?? "en"}:${shot.theme ?? "dark"}`;
      let ctx = contexts.get(key);
      if (!ctx) {
        ctx = await browser.newContext({
          ...DEVICES[device],
          colorScheme: shot.theme ?? "dark",
          locale: shot.lang === "de" ? "de-CH" : "en-GB",
          timezoneId: "Europe/Zurich",
          reducedMotion: "reduce",
        });
        if (shot.who !== "anon") {
          await ctx.addCookies([{ name: "better-auth.session_token", value: sessions[shot.who], url: BASE, httpOnly: true, sameSite: "Lax" }]);
        }
        contexts.set(key, ctx);
      }
      const page = await ctx.newPage();
      await page.clock.setFixedTime(new Date(NOW));
      const res = await page.goto(BASE + shot.path, { waitUntil: "networkidle" });
      if (!res || res.status() >= 400) throw new Error(`${shot.name}: ${shot.path} answered ${res?.status()}`);
      if (shot.who !== "anon" && new URL(page.url()).pathname === "/login") throw new Error(`${shot.name}: not signed in`);
      await page.evaluate(() => document.fonts.ready);
      // No blinking caret or hover state in the images.
      await page.addStyleTag({ content: "*, *::before, *::after { caret-color: transparent !important; }" });
      await page.mouse.move(0, 0);
      if (shot.act) await shot.act(page);
      if (shot.full) {
        // Grow the window to the whole page instead of using fullPage, so fixed bars (phone tab bar) stay at the bottom.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: DEVICES[device].viewport.width, height: Math.min(height, 6000) });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
      }
      const png = await page.screenshot({ animations: "disabled" });
      const file = path.join(OUT, `${shot.name}.png`);
      if (fs.existsSync(file) && samePicture(fs.readFileSync(file), png)) {
        console.log(`  ${shot.name} (unchanged)`);
      } else {
        fs.writeFileSync(file, png);
        changed++;
        console.log(`✓ ${shot.name}`);
      }
      await page.close();
    }
    console.log(`${changed} of ${shots.length} screenshots changed.`);
  } catch (e) {
    console.error(log.split("\n").slice(-40).join("\n"));
    throw e;
  } finally {
    await browser?.close();
    discord.close();
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Answers the few Discord calls the Health page makes (bot user, the two platform
 * channels) and refuses everything else, as Discord would with a fake token.
 */
function fakeDiscord() {
  const answers: Record<string, unknown> = {
    "GET /users/@me": { id: "1234567890123456780", username: "Seatbit" },
    [`GET /channels/${OPS_CHANNEL}`]: { id: OPS_CHANNEL, name: "seatbit-ops" },
    [`GET /channels/${ANNOUNCE_CHANNEL}`]: { id: ANNOUNCE_CHANNEL, name: "announcements" },
  };
  const server = http.createServer((req, res) => {
    const body = answers[`${req.method} ${req.url}`];
    res.writeHead(body ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body ?? { message: "401: Unauthorized", code: 0 }));
  });
  server.listen(DISCORD_PORT, "127.0.0.1");
  return server;
}

/**
 * Chromium's text and blur rendering differs by a shade or two between runs.
 * Treat pictures as the same when no pixel differs by more than a few levels,
 * so unchanged pages don't show up as changed files.
 */
function samePicture(a: Buffer, b: Buffer) {
  const x = PNG.sync.read(a);
  const y = PNG.sync.read(b);
  if (x.width !== y.width || x.height !== y.height) return false;
  for (let i = 0; i < x.data.length; i++) if (Math.abs(x.data[i] - y.data[i]) > 8) return false;
  return true;
}

/** A Better Auth session per demo user, returned as signed cookie values. */
function createSessions(dbFile: string, who: string[]) {
  const sqlite = new Database(dbFile);
  const out: Record<string, string> = {};
  for (const key of who) {
    const token = crypto.randomBytes(24).toString("base64url");
    const now = Date.now();
    sqlite
      .prepare("INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)")
      .run(crypto.randomUUID(), now + 3650 * 864e5, token, now, now, `demo-${key}`);
    // Same format as Better Auth's signed cookies: "<token>.<base64 HMAC-SHA256>".
    const sig = crypto.createHmac("sha256", SECRET).update(token).digest("base64");
    out[key] = encodeURIComponent(`${token}.${sig}`);
  }
  sqlite.close();
  return out;
}

/** A week of nightly backups (copies of the demo database) with fixed times, for the backups page. */
function demoBackups(dbFile: string, dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const p2 = (n: number) => String(n).padStart(2, "0");
  let newest: { name: string; at: Date } | undefined;
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.parse(NOW) - i * 86400_000);
    d.setUTCHours(2, 30, 0, 0);
    const name = `seatbit-${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}-023000.db`;
    const file = path.join(dir, name);
    fs.copyFileSync(dbFile, file);
    fs.utimesSync(file, d, d);
    newest ??= { name, at: d };
  }
  // A passed restore test of the newest one (as src/lib/backup-drill.ts stores it), so the scheduler
  // doesn't run one while the shots are taken and the card shows fixed values.
  const sqlite = new Database(dbFile);
  const rows = (sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'").get() as { n: number }).n;
  const at = new Date(newest!.at.getTime() + 60_000).toISOString();
  const result = { name: newest!.name, at, backupAt: newest!.at.toISOString(), ok: true, ms: 84, migrated: 0, tables: rows, rows: 812, liveRows: 812 };
  sqlite.prepare("INSERT OR REPLACE INTO app_setting (key, value, encrypted, updated_at) VALUES ('state.backup.drill', ?, 0, ?)").run(JSON.stringify(result), Date.now());
  sqlite.close();
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, quiet = false) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: quiet ? "pipe" : "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stderr ?? ""}${r.stdout ?? ""}`);
}

async function waitForServer(server: ChildProcess, log: () => string) {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    if (server.exitCode !== null) throw new Error(`Server exited:\n${log()}`);
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server didn't start:\n${log()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
