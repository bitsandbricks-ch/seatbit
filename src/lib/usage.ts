/**
 * Platform usage stats for admins (/admin/stats): accounts, active people, clans and
 * events over time. "Active" means someone used Seatbit that day: recorded once per
 * person and day in user_activity, plus what older data already shows (answers, sign-ups,
 * sessions, audit entries), so the charts aren't empty for the time before tracking began.
 */
import { eq, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";

/** Days of activity kept. A bit over a year, so "last 12 months" stays complete. */
export const USAGE_KEEP_DAYS = 400;

const p2 = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

const g = globalThis as unknown as { __seatbitSeen?: { day: string; ids: Set<string> }; __seatbitUsagePrune?: string };

/** Notes that someone used Seatbit today. One database write per person and day. */
export function touchActivity(userId: string) {
  const day = dayKey(new Date());
  if (g.__seatbitSeen?.day !== day) g.__seatbitSeen = { day, ids: new Set() };
  const seen = g.__seatbitSeen;
  if (seen.ids.has(userId)) return;
  seen.ids.add(userId);
  try {
    db.insert(schema.userActivity).values({ userId, day }).onConflictDoNothing().run();
    if (g.__seatbitUsagePrune !== day) {
      g.__seatbitUsagePrune = day;
      db.delete(schema.userActivity)
        .where(lt(schema.userActivity.day, dayKey(new Date(Date.now() - USAGE_KEEP_DAYS * 86400_000))))
        .run();
    }
  } catch (e) {
    // Stats must never break a page.
    console.error("[usage] could not record activity", e);
  }
}

export type UsageRange = "weeks" | "months" | "all";
export const USAGE_RANGES: UsageRange[] = ["weeks", "months", "all"];

export type UsageBucket = {
  start: Date;
  end: Date;
  /** Accounts that existed at the end (not guests, not deleted by then). */
  users: number;
  newUsers: number;
  activeUsers: number;
  clans: number;
  activeClans: number;
  /** Published, not cancelled events that started in this period. */
  events: number;
  /** People who were going to those events. */
  attendees: number;
  newEvents: number;
};

function buckets(range: UsageRange, now: Date, first: Date): { start: Date; end: Date }[] {
  const out: { start: Date; end: Date }[] = [];
  if (range === "weeks") {
    // Monday-based weeks, the last 12 including this one.
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    for (let i = 11; i >= 0; i--) {
      const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7);
      out.push({ start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) });
    }
    return out;
  }
  let count = 12;
  if (range === "all") {
    count = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
    count = Math.min(Math.max(count, 1), 120);
  }
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) });
  }
  return out;
}

type Hit = { userId: string; at: number };

/** Every known "this person did something at this time", from all the places that record it. */
function activityHits(since: Date): Hit[] {
  const s = since.getTime();
  const sinceDay = dayKey(since);
  const rows = db.all<{ userId: string; at: number }>(sql`
    select user_id as userId, cast(unixepoch(day || ' 12:00:00', 'utc') * 1000 as integer) as at
      from user_activity where day >= ${sinceDay}
    union all select user_id, updated_at from attendance where updated_at >= ${s}
    union all select user_id, created_at from attendance where created_at >= ${s}
    union all select user_id, created_at from session where created_at >= ${s}
    union all select user_id, updated_at from session where updated_at >= ${s}
    union all select user_id, created_at from lan_interest where created_at >= ${s}
    union all select actor_id, at from audit_log where actor_id is not null and at >= ${s}
  `);
  return rows;
}

export function usageStats(range: UsageRange, now = new Date()) {
  const users = db
    .select({ id: schema.user.id, createdAt: schema.user.createdAt, deletedAt: schema.user.deletedAt, isGuest: schema.user.isGuest })
    .from(schema.user)
    .all();
  const accounts = users.filter((u) => !u.isGuest);
  const accountIds = new Set(accounts.map((u) => u.id));
  const clans = db.select({ id: schema.clan.id, createdAt: schema.clan.createdAt }).from(schema.clan).all();
  const members = db
    .select({ clanId: schema.clanMember.clanId, userId: schema.clanMember.userId, role: schema.clanMember.role })
    .from(schema.clanMember)
    .all()
    .filter((m) => m.role !== "pending");
  const lans = db
    .select({
      id: schema.lan.id,
      clanId: schema.lan.clanId,
      startsAt: schema.lan.startsAt,
      endsAt: schema.lan.endsAt,
      createdAt: schema.lan.createdAt,
      publishedAt: schema.lan.publishedAt,
      cancelledAt: schema.lan.cancelledAt,
      dateTbd: schema.lan.dateTbd,
    })
    .from(schema.lan)
    .all();
  const going = db
    .select({ lanId: schema.attendance.lanId, n: sql<number>`count(*)` })
    .from(schema.attendance)
    .where(eq(schema.attendance.status, "going"))
    .groupBy(schema.attendance.lanId)
    .all();
  const goingBy = new Map(going.map((r) => [r.lanId, Number(r.n)]));

  const first = new Date(Math.min(now.getTime(), ...accounts.map((u) => u.createdAt.getTime()), ...clans.map((c) => c.createdAt.getTime())));
  const bs = buckets(range, now, first);
  const hits = activityHits(bs[0].start).filter((h) => accountIds.has(h.userId));
  const clansOf = new Map<string, string[]>();
  for (const m of members) clansOf.set(m.userId, [...(clansOf.get(m.userId) ?? []), m.clanId]);
  const held = lans.filter((l) => l.publishedAt && !l.cancelledAt && !l.dateTbd);

  const result: UsageBucket[] = bs.map(({ start, end }) => {
    const a = start.getTime();
    const b = end.getTime();
    const inB = (d: Date | null | undefined) => !!d && d.getTime() >= a && d.getTime() < b;
    const active = new Set(hits.filter((h) => h.at >= a && h.at < b).map((h) => h.userId));
    const activeClans = new Set<string>();
    for (const id of active) for (const c of clansOf.get(id) ?? []) activeClans.add(c);
    // A clan whose event runs in this period counts as active too.
    for (const l of held) if (l.clanId && l.startsAt.getTime() < b && l.endsAt.getTime() >= a) activeClans.add(l.clanId);
    const events = held.filter((l) => inB(l.startsAt));
    return {
      start,
      end,
      users: accounts.filter((u) => u.createdAt.getTime() < b && !(u.deletedAt && u.deletedAt.getTime() < b)).length,
      newUsers: accounts.filter((u) => inB(u.createdAt)).length,
      activeUsers: active.size,
      clans: clans.filter((c) => c.createdAt.getTime() < b).length,
      // Membership is today's, so leave out clans that didn't exist yet.
      activeClans: [...activeClans].filter((id) => clans.some((c) => c.id === id && c.createdAt.getTime() < b)).length,
      events: events.length,
      attendees: events.reduce((n, l) => n + (goingBy.get(l.id) ?? 0), 0),
      newEvents: lans.filter((l) => inB(l.createdAt)).length,
    };
  });

  // Headline numbers: today and the last 30 days.
  const d30 = now.getTime() - 30 * 86400_000;
  const recent = activityHits(new Date(d30)).filter((h) => accountIds.has(h.userId) && h.at <= now.getTime());
  const active30 = new Set(recent.map((h) => h.userId));
  const activeClans30 = new Set<string>();
  for (const id of active30) for (const c of clansOf.get(id) ?? []) activeClans30.add(c);
  const live = accounts.filter((u) => !u.deletedAt);
  const totals = {
    users: live.length,
    guests: users.filter((u) => u.isGuest && !u.deletedAt).length,
    newUsers30: live.filter((u) => u.createdAt.getTime() >= d30).length,
    active30: active30.size,
    clans: clans.length,
    activeClans30: activeClans30.size,
    upcoming: held.filter((l) => l.endsAt.getTime() >= now.getTime()).length,
    held12m: held.filter((l) => l.startsAt.getTime() < now.getTime() && l.startsAt.getTime() >= now.getTime() - 365 * 86400_000).length,
  };
  return { buckets: result, totals };
}
