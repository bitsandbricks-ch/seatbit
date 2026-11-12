import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus, Lan, Nickname } from "@/db/schema";
import { appUrl } from "./mail";
import { personLabel, type NameDisplay } from "./names";
import { eventMailVars, renderTemplate } from "./mail-templates";
import { notify } from "./notify";

const { attendance, nickname, seat, user, lan } = schema;

export { rowLetter, seatLabel } from "./seat-labels";

/**
 * Picks the nick shown for a user at a LAN: event nick, then LAN-type nick,
 * then default nick (primary first in each scope), then the account name.
 */
export function pickNick(
  nicks: Nickname[],
  scope: { lanId: string | null; typeId: string | null },
  fallback: string,
) {
  const pick = (list: Nickname[]) => list.find((n) => n.isPrimary)?.nick ?? list[0]?.nick;
  return (
    (scope.lanId ? pick(nicks.filter((n) => n.lanId === scope.lanId)) : undefined) ??
    (scope.typeId ? pick(nicks.filter((n) => n.typeId === scope.typeId)) : undefined) ??
    pick(nicks.filter((n) => n.lanId === null && n.typeId === null)) ??
    fallback
  );
}

/**
 * A member's name: the nick alone (tight spots), the full Name "Nick" Surname, the
 * label the clan's name display asks for, and whether it's a real account (not a guest).
 */
export type PersonName = { nick: string; full: string; label: string; verified: boolean };

/** The clan's name display setting; "full" outside a clan. */
export function clanNameDisplay(clanId: string | null | undefined): NameDisplay {
  if (!clanId) return "full";
  return db.select({ d: schema.clan.nameDisplay }).from(schema.clan).where(eq(schema.clan.id, clanId)).get()?.d ?? "full";
}

function personName(u: typeof user.$inferSelect, nick: string, mode: NameDisplay): PersonName {
  return { nick, full: personLabel(u, nick), label: personLabel(u, nick, mode), verified: !u.isGuest };
}

/**
 * Map userId -> names at a LAN (nick: event > LAN type > default). The label follows the
 * event's clan setting; orga views pass mode "full".
 */
export async function getNames(lanId: string, userIds: string[], mode?: NameDisplay) {
  const map = new Map<string, PersonName>();
  if (userIds.length === 0) return map;
  const l = getLan(lanId);
  const typeId = l?.typeId ?? null;
  const display = mode ?? clanNameDisplay(l?.clanId);
  const users = db.select().from(user).where(inArray(user.id, userIds)).all();
  const nicks = db
    .select()
    .from(nickname)
    .where(
      and(
        inArray(nickname.userId, userIds),
        or(
          and(isNull(nickname.lanId), isNull(nickname.typeId)),
          eq(nickname.lanId, lanId),
          typeId ? eq(nickname.typeId, typeId) : undefined,
        ),
      ),
    )
    .all();
  for (const u of users) {
    const nick = pickNick(nicks.filter((n) => n.userId === u.id), { lanId, typeId }, u.name);
    map.set(u.id, personName(u, nick, display));
  }
  return map;
}

/**
 * Map userId -> names outside a LAN (clan pages, stats, invites): default nick only.
 * The label follows mode (default "full", for admin views and mails).
 */
export function getDefaultNames(userIds: string[], mode: NameDisplay = "full") {
  const map = new Map<string, PersonName>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return map;
  const users = db.select().from(user).where(inArray(user.id, ids)).all();
  const nicks = db
    .select()
    .from(nickname)
    .where(and(inArray(nickname.userId, ids), isNull(nickname.lanId), isNull(nickname.typeId)))
    .all();
  for (const u of users) {
    const nick = pickNick(nicks.filter((n) => n.userId === u.id), { lanId: null, typeId: null }, u.name);
    map.set(u.id, personName(u, nick, mode));
  }
  return map;
}

/** Map userId -> how the member is shown at a LAN, per the clan's name display: Mike "Reyki" Keller. */
export async function getDisplayNames(lanId: string, userIds: string[]) {
  return new Map([...(await getNames(lanId, userIds))].map(([id, n]) => [id, n.label]));
}

/** Map userId -> just the nick at a LAN, for places with no room for the full name. */
export async function getNicks(lanId: string, userIds: string[]) {
  return new Map([...(await getNames(lanId, userIds))].map(([id, n]) => [id, n.nick]));
}

export function goingCount(lanId: string) {
  return db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all().length;
}

/**
 * Once a member has bought their ticket (or an orga confirmed it), their answer
 * is locked: only orgas can change it. Stops people dropping out with a ticket
 * the group already counted on.
 */
export function attendanceLocked(a: { ticketBought: boolean; paid: boolean } | null | undefined) {
  return !!a && (a.ticketBought || a.paid);
}
export const ATTENDANCE_LOCKED_MSG = "You have a ticket, so your answer is locked. Ask an orga if your plans change.";

export function signupClosed(l: Lan, now = new Date()) {
  return !!l.cancelledAt || l.interestCheck || (l.signupDeadline && l.signupDeadline < now) || l.endsAt < now;
}

/**
 * Sets a user's attendance. "going" turns into "waitlist" when the LAN is
 * full. Leaving "going" frees the seat and promotes the next waitlisted user.
 * Returns the status that was actually stored.
 */
export async function setAttendance(
  l: Lan,
  userId: string,
  requested: AttendanceStatus,
  opts: { force?: boolean } = {},
): Promise<AttendanceStatus> {
  const existing = db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, l.id), eq(attendance.userId, userId)))
    .get();

  let status = requested;
  if (status === "going" && existing?.status !== "going" && !opts.force) {
    if (l.capacity != null && goingCount(l.id) >= l.capacity) status = "waitlist";
  }

  if (existing) {
    db.update(attendance).set({ status }).where(eq(attendance.id, existing.id)).run();
  } else {
    db.insert(attendance).values({ lanId: l.id, userId, status }).run();
  }

  if (existing?.status === "going" && status !== "going") {
    db.update(seat)
      .set({ userId: null })
      .where(and(eq(seat.lanId, l.id), eq(seat.userId, userId)))
      .run();
    await promoteFromWaitlist(l);
  }
  // Keep the attendee list on Discord announcements current.
  void import("./discord").then((d) => d.refreshLanMessagesSoon(l.id)).catch(() => {});
  return status;
}

/** Moves waitlisted users to "going" while there is room, oldest first. */
export async function promoteFromWaitlist(l: Lan) {
  if (l.capacity == null) return;
  let free = l.capacity - goingCount(l.id);
  if (free <= 0) return;
  const waiting = db
    .select({ a: attendance, u: user })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.lanId, l.id), eq(attendance.status, "waitlist")))
    .orderBy(asc(attendance.createdAt))
    .all();
  for (const { a, u } of waiting) {
    if (free <= 0) break;
    db.update(attendance).set({ status: "going" }).where(eq(attendance.id, a.id)).run();
    free--;
    if (!l.publishedAt) continue; // drafts tell nobody
    await notify(u, {
      kind: "waitlistPromoted",
      ...renderTemplate("waitlistPromoted", eventMailVars(l, u)),
      url: `${appUrl}/lans/${l.id}`,
    }).catch((e) => console.error("[notify] failed", e));
  }
}

export function getLan(id: string) {
  return db.select().from(lan).where(eq(lan.id, id)).get();
}

/** A seat as the seat map shows it: short nick for the cell, the name label for the details pane. */
export function seatView<S extends { userId: string | null }>(
  s: S,
  people: Map<string, PersonName>,
  avatars: Map<string, { color: string }>,
) {
  const p = s.userId ? people.get(s.userId) : undefined;
  return {
    ...s,
    nick: s.userId ? (p?.nick ?? "?") : null,
    name: s.userId ? (p?.label ?? "?") : null,
    color: s.userId ? (avatars.get(s.userId)?.color ?? null) : null,
  };
}

/**
 * Whether the edit form may switch the interest check on or off:
 * - drafts: freely
 * - published and in the interest check: only "Open sign-up" ends it
 * - published with sign-up open: only while nobody has answered yet
 */
export type InterestSwitch = "free" | "on-locked" | "off-locked";
export function interestSwitch(l: Lan): InterestSwitch {
  if (!l.publishedAt) return "free";
  if (l.interestCheck) return "on-locked";
  const answered = db.select({ id: attendance.id }).from(attendance).where(eq(attendance.lanId, l.id)).get();
  return answered ? "off-locked" : "free";
}

/** Makes every admin of the clan an orga of the event (new events and next year's copies). */
export function addClanAdminsAsOrgas(lanId: string, clanId: string | null) {
  if (!clanId) return;
  const admins = db
    .select({ userId: schema.clanMember.userId })
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, clanId), eq(schema.clanMember.role, "admin")))
    .all();
  const have = new Set(db.select().from(schema.lanOrga).where(eq(schema.lanOrga.lanId, lanId)).all().map((o) => o.userId));
  for (const a of admins) if (!have.has(a.userId)) db.insert(schema.lanOrga).values({ lanId, userId: a.userId }).run();
}
