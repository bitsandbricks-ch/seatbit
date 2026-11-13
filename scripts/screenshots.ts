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

type Who = "anon" | "alex" | "anna" | "sara";
type Device = "phone" | "desktop";
type Shot = {
  name: string;
  who: Who;
  path: string;
  /** Runs after the page loaded, e.g. to open a seat's details. */
  act?: (page: Page) => Promise<void>;
  /** Capture the whole page instead of the first screen. */
  full?: boolean;
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

// Device comes from the name prefix.
const SHOTS: Shot[] = [
  // Signed out
  { name: "phone-login", who: "anon", path: "/login" },
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
  { name: "phone-interest", who: "anna", path: RETRO, full: true },
  { name: "phone-waitlist", who: "sara", path: `${MOUNTAIN}?tab=attendees`, full: true },
  { name: "phone-clans", who: "anna", path: "/clans" },
  { name: "phone-clan", who: "anna", path: CLAN, full: true },
  { name: "phone-profile", who: "anna", path: "/profile", full: true },
  { name: "phone-member-profile", who: "anna", path: `${CLAN}/members/demo-chiara`, full: true },
  {
    name: "phone-profile-delete",
    who: "anna",
    path: "/profile",
    act: async (page) => {
      await page.getByRole("button", { name: "Delete my account…" }).click();
      await page.evaluate(() => {
        const h = [...document.querySelectorAll("h2, h3")].find((e) => e.textContent === "Your data");
        if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 90, behavior: "instant" });
      });
      await page.waitForTimeout(300);
    },
  },

  // Sara joined, but the orgas had added her as a guest already
  { name: "phone-clan-claim", who: "sara", path: `${CLAN}/claim`, full: true },
  // ... and pressed "That's me" after /claim on Discord before she had an account
  { name: "phone-discord-claim", who: "sara", path: `/claim/discord/${discordClaimTicket()}` },

  // An orga (Alex) on the phone
  { name: "phone-manage", who: "alex", path: `${LAKESIDE}/manage`, full: true },
  { name: "phone-manage-missing", who: "alex", path: `${LAKESIDE}/manage?tab=missing` },
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

  // Desktop, as Alex (platform admin, clan admin and orga)
  { name: "desktop-lans", who: "alex", path: "/" },
  { name: "desktop-event", who: "alex", path: LAKESIDE },
  { name: "desktop-event-seats", who: "alex", path: `${LAKESIDE}?tab=seats`, act: seat("F9") },
  { name: "desktop-event-attendees", who: "alex", path: `${LAKESIDE}?tab=attendees` },
  { name: "desktop-games", who: "alex", path: `${LAKESIDE}?tab=games` },
  { name: "desktop-food", who: "alex", path: `${LAKESIDE}?tab=food`, full: true },
  { name: "desktop-manage", who: "alex", path: `${LAKESIDE}/manage` },
  { name: "desktop-manage-attendees", who: "alex", path: `${LAKESIDE}/manage?tab=attendees` },
  { name: "desktop-manage-waitlist", who: "alex", path: `${MOUNTAIN}/manage?tab=attendees` },
  { name: "desktop-manage-missing", who: "alex", path: `${LAKESIDE}/manage?tab=missing`, full: true },
  { name: "desktop-manage-seats", who: "alex", path: `${LAKESIDE}/manage?tab=seats`, act: seat("F12") },
  { name: "desktop-manage-chat", who: "alex", path: `${LAKESIDE}/manage?tab=chat` },
  { name: "desktop-manage-settings", who: "alex", path: `${LAKESIDE}/manage?tab=settings`, full: true },
  { name: "desktop-new-event", who: "alex", path: `${CLAN}/lans/new` },
  { name: "desktop-event-draft", who: "alex", path: `${DRAFT}/manage` },
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
  { name: "desktop-clan-audit-log", who: "alex", path: `${CLAN}/settings?tab=log` },
  { name: "desktop-admin-audit-log", who: "alex", path: "/admin/log" },
  { name: "desktop-profile", who: "alex", path: "/profile" },
  { name: "desktop-admin", who: "alex", path: "/admin" },
  { name: "desktop-admin-mail", who: "alex", path: "/admin/settings?tab=mail" },
  { name: "desktop-admin-discord", who: "alex", path: "/admin/settings?tab=discord" },
  { name: "desktop-admin-legal", who: "alex", path: "/admin/settings?tab=legal", full: true },
  { name: "desktop-admin-billing", who: "alex", path: "/admin/settings?tab=billing", full: true },
  { name: "desktop-admin-templates", who: "alex", path: "/admin/settings?tab=templates" },
  { name: "desktop-privacy", who: "alex", path: "/privacy" },
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
    // Fake Discord app, so the login button and Discord settings show up. Nothing talks to Discord.
    DISCORD_CLIENT_ID: "1234567890123456789",
    DISCORD_CLIENT_SECRET: "screenshots-only",
    DISCORD_BOT_TOKEN: "screenshots-only-not-a-real-token",
    DISCORD_PUBLIC_KEY: "0".repeat(64),
    // Example operator, so the legal pages look like a configured instance.
    LEGAL_OPERATOR_NAME: "Example Gaming Club",
    LEGAL_OPERATOR_ADDRESS: "Example Street 1, 6000 Lucerne, Switzerland",
    LEGAL_CONTACT_EMAIL: "hello@example.com",
    LEGAL_HOSTING_LOCATION: "Switzerland",
    LEGAL_GOVERNING_LAW: "Swiss law",
    // Supporter payments on, with fake Stripe values. Prices can't be fetched, so buttons show their fallback labels.
    BILLING_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_screenshots_only",
    STRIPE_WEBHOOK_SECRET: "whsec_screenshots_only",
    STRIPE_PRICE_ANNUAL: "price_screenshotsAnnual",
    STRIPE_PRICE_MONTHLY: "price_screenshotsMonthly",
    ALLOW_EMAIL_LOGIN: "",
    SMTP_HOST: "",
    SMTP_URL: "",
  };

  run("npx", ["tsx", "scripts/seed-demo.ts", "--discord"], env, true);
  const sessions = createSessions(dbFile, ["alex", "anna", "sara"]);

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
      const key = `${shot.who}:${device}`;
      let ctx = contexts.get(key);
      if (!ctx) {
        ctx = await browser.newContext({
          ...DEVICES[device],
          colorScheme: "dark",
          locale: "en-GB",
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
    try {
      process.kill(-server.pid!, "SIGTERM");
    } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
