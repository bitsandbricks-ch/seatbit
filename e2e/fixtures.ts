/**
 * Test helpers: sign in as a demo user without Discord, and create fresh events
 * straight in the test database, so every test starts from known data and tests
 * don't depend on each other.
 */
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import * as schema from "../src/db/schema";
import { BASE_URL, CLAN_ID, DB_FILE, SECRET } from "./env";

export { expect };

/** Demo users (scripts/seed-demo.ts): alex is platform owner, clan admin and lead; anna, ben, ... are members. */
export type Who = "alex" | "anna" | "ben" | "chiara" | "david" | "elena";
export const userId = (who: Who) => `demo-${who}`;

let conn: ReturnType<typeof open> | undefined;
function open() {
  const sqlite = new Database(DB_FILE);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}
/** The server's database (SQLite in WAL mode, so tests can read and write next to it). */
export const db = () => (conn ??= open());

/**
 * A Better Auth session for a demo user, as the signed cookie the app expects
 * ("<token>.<base64 HMAC-SHA256>", same as scripts/screenshots.ts).
 */
export async function signIn(context: BrowserContext, who: Who) {
  const token = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  db()
    .insert(schema.session)
    .values({ id: crypto.randomUUID(), token, userId: userId(who), expiresAt: new Date(now.getTime() + 864e5), createdAt: now, updatedAt: now })
    .run();
  const sig = crypto.createHmac("sha256", SECRET).update(token).digest("base64");
  await context.addCookies([{ name: "better-auth.session_token", value: encodeURIComponent(`${token}.${sig}`), url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

const DAY = 864e5;

type EventOptions = {
  name?: string;
  /** Seat labels of the group's block, e.g. ["A1", "A2"]. Row = letter, column = number. */
  seats?: string[];
  seatPicking?: boolean;
  capacity?: number;
  /** Who already answered, with optional ticket and seat. */
  attendees?: { who: Who; status?: "going" | "maybe" | "declined"; ticket?: boolean; seat?: string }[];
  /** Start in the interest check (published, sign-up not open yet). */
  interestCheck?: boolean;
  /** Interest check answers. */
  interest?: { who: Who; answer: "yes" | "maybe" | "no" }[];
};

/** A published event of the demo clan a month from now, led by Alex. Returns its id. */
export function createEvent(opts: EventOptions = {}) {
  const id = `e2e-${crypto.randomUUID().slice(0, 8)}`;
  const starts = new Date(Date.now() + 30 * DAY);
  const d = db();
  d.transaction((tx) => {
    tx.insert(schema.lan)
      .values({
        id,
        clanId: CLAN_ID,
        name: opts.name ?? `Test LAN ${id}`,
        location: "Test hall",
        startsAt: starts,
        endsAt: new Date(starts.getTime() + 2 * DAY),
        signupDeadline: new Date(Date.now() + 10 * DAY),
        capacity: opts.capacity ?? null,
        seatPicking: opts.seatPicking ?? false,
        seatRows: 1,
        seatCols: Math.max(1, ...(opts.seats ?? []).map((l) => Number(l.slice(1)))),
        publishedAt: new Date(Date.now() - DAY),
        interestCheck: opts.interestCheck ?? false,
      })
      .run();
    tx.insert(schema.lanOrga).values({ lanId: id, userId: userId("alex") }).run();
    const seated = new Map((opts.attendees ?? []).filter((a) => a.seat).map((a) => [a.seat!, userId(a.who)]));
    for (const label of opts.seats ?? []) {
      tx.insert(schema.seat)
        .values({ lanId: id, row: 0, col: Number(label.slice(1)) - 1, label, userId: seated.get(label) ?? null })
        .run();
    }
    for (const i of opts.interest ?? []) {
      tx.insert(schema.lanInterest).values({ lanId: id, userId: userId(i.who), answer: i.answer }).run();
    }
    for (const a of opts.attendees ?? []) {
      tx.insert(schema.attendance)
        .values({ lanId: id, userId: userId(a.who), status: a.status ?? "going", ticketBought: !!a.ticket })
        .run();
    }
  });
  return id;
}

/** Pages signed in as demo users: `as("anna")` gives Anna's page in her own browser context. */
export const test = base.extend<{ as: (who: Who) => Promise<Page> }>({
  // "provide" is Playwright's `use`; renamed so the React hooks lint rule leaves it alone.
  as: async ({ browser }, provide) => {
    const contexts: BrowserContext[] = [];
    await provide(async (who) => {
      const context = await browser.newContext();
      contexts.push(context);
      await signIn(context, who);
      return context.newPage();
    });
    for (const c of contexts) await c.close();
  },
});
