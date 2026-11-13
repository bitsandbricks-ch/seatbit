/**
 * Runs server actions as different people against a seeded throwaway database
 * and tells whether a call changed anything. Loaded after setup.cjs (which picks
 * the database and stubs next/headers), see tests/authz/README.md.
 */
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "better-auth/crypto";
import { seedDemo, DEMO_PASSWORD } from "../../scripts/seed-demo";
import { db, schema } from "../../src/db";
import { getAuth } from "../../src/lib/auth";

const s = schema;
const DAY = 86_400_000;

/**
 * Who tries. Targets live in the demo clan "Pixel Pirates" (demo-clan); the
 * outsider runs a clan of their own, so a check that looks at the wrong clan shows.
 */
export const ACTORS = {
  anon: null,
  suspended: "demo-sam", // demo-clan member, suspended platform-wide
  outsider: "demo-olaf", // admin of demo-clan-x and lead of its event, not in demo-clan
  pending: "demo-tim", // asked to join demo-clan, not approved
  member: "demo-anna", // plain member, going to Lakeside LAN
  lead: "demo-david", // plain member, lead of Lakeside LAN only
  recruiter: "demo-lea",
  organizer: "demo-chiara", // clan role "event manager"
  clanAdmin: "demo-ben",
  support: "demo-nina", // platform: view only; not in demo-clan
  moderator: "demo-oliver", // platform: view, reports, suspend; not in demo-clan
  owner: "demo-alex", // platform owner (and demo-clan admin)
} as const;
export type Actor = keyof typeof ACTORS;
export const ALL_ACTORS = Object.keys(ACTORS) as Actor[];

/** Ids the specs point at; filled in by setup(). */
export const fx = {
  clan: "demo-clan",
  otherClan: "demo-clan-x",
  lan: "demo-lan-lakeside", // published, final seat plan
  pickLan: "demo-lan-mountain", // members pick their own seats, has a waitlist
  interestLan: "demo-lan-retro",
  draftLan: "demo-lan-lakeside-next",
  openLan: "demo-lan-open", // published, nobody answered yet
  otherLan: "demo-lan-x",
  type: "",
  otherType: "demo-type-x",
  guest: "demo-yannick",
  guestClaim: "",
  invite: "demo-invite",
  seat: "", // a taken seat on Lakeside
  freeSeat: "", // an empty seat on Lakeside
  pickSeat: "", // an empty seat on Mountain
  annaAttendance: "",
  news: "",
  travelOffer: "demo-ride-lea",
  travelRequest: "demo-ride-req",
  annaPackingItem: "demo-pack-anna",
  game: "demo-game-cs",
  annaGame: "demo-game-anna",
  foodOrder: "demo-food-pizza", // run by Anna
  annaFoodItem: "",
  charge: "demo-charge-dues",
  annaChargeItem: "",
  leadTask: "demo-task-block",
  lanLeadTask: "demo-task-parking",
  leadContact: "demo-contact-seats",
  swapToAnna: "",
  swapFromAnna: "",
  report: "",
  discordChannel: "1234567890123456789",
  annaClaimable: "demo-guest-anna", // a guest in demo-clan named like Anna
  backup: "seatbit-20261101-030000.db",
};

export async function setup() {
  await seedDemo();
  const q = db.$client;
  const password = await hashPassword(DEMO_PASSWORD);
  const user = (id: string, first: string, extra: Partial<typeof s.user.$inferInsert> = {}) => {
    db.insert(s.user)
      .values({ id, name: `${first} Test`, firstName: first, lastName: "Test", email: `${first.toLowerCase()}@example.com`, emailVerified: true, ...extra })
      .run();
    db.insert(s.account).values({ id: `${id}-acc`, accountId: id, providerId: "credential", userId: id, password, updatedAt: new Date() }).run();
  };

  // The outsider and their own clan, event and LAN type.
  user(ACTORS.outsider, "Olaf");
  db.insert(s.clan).values({ id: fx.otherClan, name: "Other Clan", slug: "other-clan", joinPolicy: "approval" }).run();
  db.insert(s.clanMember).values({ clanId: fx.otherClan, userId: ACTORS.outsider, role: "admin" }).run();
  db.insert(s.lanType).values({ id: fx.otherType, clanId: fx.otherClan, name: "Other LAN" }).run();
  db.insert(s.lan)
    .values({
      id: fx.otherLan,
      clanId: fx.otherClan,
      typeId: fx.otherType,
      name: "Other LAN",
      startsAt: new Date(Date.now() + 40 * DAY),
      endsAt: new Date(Date.now() + 42 * DAY),
      publishedAt: new Date(),
    })
    .run();
  db.insert(s.lanOrga).values({ lanId: fx.otherLan, userId: ACTORS.outsider }).run();
  db.insert(s.attendance).values({ lanId: fx.otherLan, userId: ACTORS.outsider, status: "going" }).run();

  // A published demo-clan event nobody answered yet.
  db.insert(s.lan)
    .values({ id: fx.openLan, clanId: fx.clan, name: "Open LAN", startsAt: new Date(Date.now() + 60 * DAY), endsAt: new Date(Date.now() + 62 * DAY), publishedAt: new Date() })
    .run();

  // A suspended member of the demo clan, going to Lakeside.
  user(ACTORS.suspended, "Sam", { suspendedAt: new Date() });
  db.insert(s.clanMember).values({ clanId: fx.clan, userId: ACTORS.suspended, role: "member" }).run();
  db.insert(s.attendance).values({ lanId: fx.lan, userId: ACTORS.suspended, status: "going" }).run();

  // Platform staff who aren't in the demo clan: their staff role alone must not let them change it.
  // (They keep their old answers and seats, like someone who left the clan.)
  for (const a of ["support", "moderator"] as const) q.prepare("DELETE FROM clan_member WHERE user_id = ? AND clan_id = ?").run(ACTORS[a], fx.clan);

  // David leads Lakeside, but nothing else.
  db.insert(s.lanOrga).values({ lanId: fx.lan, userId: ACTORS.lead }).onConflictDoNothing().run();

  // A Discord channel linked to the demo clan, and a guest Anna could claim.
  db.insert(s.discordChannel).values({ clanId: fx.clan, guildId: "1234567890123456780", channelId: fx.discordChannel, channelName: "lan" }).run();
  db.insert(s.user)
    .values({ id: fx.annaClaimable, name: "Anna Frei", firstName: "Anna", lastName: "Frei", email: "guest-anna@example.com", isGuest: true, guestClanId: fx.clan, claimCode: "claim-anna" })
    .run();
  db.insert(s.clanMember).values({ clanId: fx.clan, userId: fx.annaClaimable, role: "member" }).run();

  // Things that belong to Anna, so others can try to touch them.
  db.insert(s.packingItem).values({ id: fx.annaPackingItem, lanId: fx.lan, userId: ACTORS.member, label: "Headset", packed: false }).run();
  db.insert(s.game).values({ id: fx.annaGame, lanId: fx.lan, name: "Anna's game", addedBy: ACTORS.member }).run();
  // Payments on, so the charge actions get past "payments are off", and a backup file to download.
  db.insert(s.appSetting).values({ key: "payments.enabled", value: "true" }).onConflictDoNothing().run();
  fs.mkdirSync(process.env.BACKUP_DIR!, { recursive: true });
  fs.writeFileSync(path.join(process.env.BACKUP_DIR!, fx.backup), "not a real backup");

  const get = (sql: string, ...args: unknown[]) => {
    const row = q.prepare(sql).get(...args) as { id: string } | undefined;
    if (!row) throw new Error(`Fixture missing: ${sql}`);
    return row.id;
  };
  fx.type = get("SELECT id FROM lan_type WHERE clan_id = ? ORDER BY name", fx.clan);
  fx.guestClaim = get("SELECT id FROM guest_claim WHERE status = 'pending'");
  fx.seat = get("SELECT id FROM seat WHERE lan_id = ? AND user_id IS NOT NULL ORDER BY label", fx.lan);
  fx.freeSeat = get("SELECT id FROM seat WHERE lan_id = ? AND user_id IS NULL ORDER BY label", fx.lan);
  fx.pickSeat = get("SELECT id FROM seat WHERE lan_id = ? AND user_id IS NULL ORDER BY label", fx.pickLan);
  fx.annaAttendance = get("SELECT id FROM attendance WHERE lan_id = ? AND user_id = ?", fx.lan, ACTORS.member);
  fx.news = get("SELECT id FROM lan_news WHERE lan_id = ?", fx.lan);
  fx.annaFoodItem = get("SELECT id FROM food_item WHERE order_id = ? AND user_id = ?", fx.foodOrder, ACTORS.member);
  fx.annaChargeItem = get("SELECT id FROM charge_item WHERE charge_id = ? AND user_id = ?", fx.charge, ACTORS.member);
  fx.report = get("SELECT id FROM report WHERE status = 'open'");

  // Seat swaps on the final Lakeside plan: one waiting for Anna, one Anna asked for.
  const swap = (from: string, to: string) => {
    q.prepare("DELETE FROM seat_swap WHERE from_user_id = ?").run(from);
    return db.insert(s.seatSwap).values({ lanId: fx.lan, fromUserId: from, toUserId: to, status: "pending" }).returning().get().id;
  };
  fx.swapToAnna = swap(ACTORS.recruiter, ACTORS.member);
  fx.swapFromAnna = swap(ACTORS.member, ACTORS.organizer);

  for (const actor of ALL_ACTORS) await signIn(actor);
}

// ---------- Sessions ----------

const cookies = new Map<Actor, string>();

async function signIn(actor: Actor) {
  const id = ACTORS[actor];
  if (!id) return;
  const { email } = db.$client.prepare("SELECT email FROM user WHERE id = ?").get(id) as { email: string };
  const res = await getAuth().api.signInEmail({ body: { email, password: DEMO_PASSWORD }, asResponse: true });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (!res.ok || !cookie) throw new Error(`Could not sign in ${actor}: ${res.status}`);
  cookies.set(actor, cookie);
}

/** Makes the next calls run as `actor` (next/headers is stubbed, see setup.cjs). */
export function actAs(actor: Actor) {
  (globalThis as unknown as { __authz: { cookie: string } }).__authz = { cookie: cookies.get(actor) ?? "" };
}

// ---------- Database snapshots ----------

/**
 * Bookkeeping that changes on any visit: sessions, "seen today", sign-in rate limits.
 * Not compared, but still restored (a suspension or sign-out deletes sessions).
 */
const IGNORED = new Set(["session", "user_activity", "verification", "rate_limit"]);

type Snapshot = Map<string, string>;

function tables(all = false): string[] {
  const rows = db.$client
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'")
    .all() as { name: string }[];
  return rows.map((t) => t.name).filter((t) => all || !IGNORED.has(t));
}

function dump(table: string) {
  return JSON.stringify(db.$client.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).raw().all(), (_, v) => (typeof v === "bigint" ? String(v) : v));
}

export function snapshot(): Snapshot {
  return new Map(tables(true).map((t) => [t, dump(t)]));
}

export function changedTables(before: Snapshot, all = false): string[] {
  return tables(all).filter((t) => before.get(t) !== dump(t));
}

/** Puts changed tables back the way they were in `before`, so one test can't leak into the next. */
export function restore(before: Snapshot) {
  const changed = changedTables(before, true);
  if (!changed.length) return;
  const q = db.$client;
  q.pragma("foreign_keys = OFF");
  try {
    q.transaction(() => {
      for (const t of changed) {
        q.prepare(`DELETE FROM "${t}"`).run();
        const rows = JSON.parse(before.get(t) ?? "[]") as unknown[][];
        if (!rows.length) continue;
        const cols = (q.prepare(`PRAGMA table_info("${t}")`).all() as { name: string }[]).map((c) => `"${c.name}"`);
        const ins = q.prepare(`INSERT INTO "${t}" (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
        for (const r of rows) ins.run(...r);
      }
    })();
  } finally {
    q.pragma("foreign_keys = ON");
  }
  // Settings are cached in memory for a few seconds.
  delete (globalThis as { __seatbitSettings?: unknown }).__seatbitSettings;
}

// ---------- Calls ----------

export type Outcome = { actor: Actor; threw?: Error; value?: unknown; changed: string[] };

export async function attempt(actor: Actor, call: () => Promise<unknown>): Promise<Outcome> {
  actAs(actor);
  const before = snapshot();
  const quiet = silence();
  let o: Outcome;
  try {
    const value = await call();
    await settle();
    o = { actor, value, changed: changedTables(before) };
  } catch (e) {
    await settle();
    o = { actor, threw: e instanceof Error ? e : new Error(String(e)), changed: changedTables(before) };
  } finally {
    quiet();
  }
  restore(before);
  return o;
}

/** Mails and Discord posts run in the background (notifyLater); let them finish before comparing. */
const settle = () => new Promise((r) => setTimeout(r, 25));

const digest = (e?: Error) => `${(e as { digest?: string } | undefined)?.digest ?? ""}`;

/** Where a redirect thrown by next/navigation goes, if it is one. */
export function redirectTarget(e?: Error) {
  const d = digest(e);
  return d.startsWith("NEXT_REDIRECT") ? d.split(";")[2] : undefined;
}

/** Turned away by navigation: sent to sign in, to the suspended page, home, the admin start page, or a 404/403 page. */
export function isRefusal(e?: Error) {
  if (!e) return false;
  if (/NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/.test(digest(e))) return true;
  const to = redirectTarget(e);
  return to !== undefined && /^\/(login|suspended|welcome|admin)?([?#].*)?$/.test(to);
}

/** Results that report failure instead of throwing: `{ error }` or `{ ok: false }`. */
export function reportsFailure(v: unknown) {
  if (v === undefined || v === null || v === false) return true;
  if (typeof v !== "object") return false;
  const r = v as { error?: unknown; ok?: unknown };
  return !!r.error || r.ok === false;
}

/** Mails and Discord posts fall back to console output in tests; keep the report readable. */
function silence() {
  const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  console.log = console.info = console.warn = console.error = () => {};
  return () => Object.assign(console, saved);
}

export const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};
