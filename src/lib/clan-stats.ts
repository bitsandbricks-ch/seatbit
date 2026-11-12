import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Attendance, AttendanceStatus, Lan } from "@/db/schema";
import { isMemberRole, type MemberRole } from "./clan-roles";

const { attendance, clanMember, lan, seat, user } = schema;

/**
 * Who was "asked" for an event: everyone in the clan (members, admins and
 * guests) who had joined before the event started, plus anyone who has an
 * answer for it. Seatbit keeps no history of people who left the clan, so they
 * drop out of past events' numbers.
 */
function askedFor(l: Lan, members: { userId: string; joinedAt: Date }[], rows: Attendance[]) {
  const ids = new Set(members.filter((m) => m.joinedAt <= l.startsAt).map((m) => m.userId));
  for (const r of rows) ids.add(r.userId);
  return ids;
}

export type EventStats = {
  lan: Lan;
  past: boolean;
  asked: number;
  answered: number;
  /** Answered before the answer-by date (or at all, when the event has none). */
  answeredOnTime: number;
  going: number;
  maybe: number;
  declined: number;
  waitlist: number;
  noAnswer: number;
  ticketReported: number;
  ticketConfirmed: number;
  seats: number;
  seatsAssigned: number;
};

export type MemberStats = {
  userId: string;
  name: string;
  firstName: string;
  lastName: string;
  isGuest: boolean;
  role: MemberRole;
  /** Past events they were asked for / answered / came to. */
  asked: number;
  answered: number;
  attended: number;
  /** Past events they left at "unsure". */
  stayedUnsure: number;
  lastAttended: Lan | null;
  upcomingComing: number;
};

/** Everything the clan stats page needs, computed in memory (clans are small). */
export function clanStats(clanId: string, now = new Date()) {
  const lans = db
    .select()
    .from(lan)
    .where(and(eq(lan.clanId, clanId), isNotNull(lan.publishedAt), isNull(lan.cancelledAt), eq(lan.interestCheck, false)))
    .orderBy(asc(lan.startsAt))
    .all();
  const members = db
    .select({ u: user, role: clanMember.role, joinedAt: clanMember.createdAt })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(eq(clanMember.clanId, clanId))
    .all()
    .filter((m) => m.role !== "pending");
  const lanIds = lans.map((l) => l.id);
  const rows = lanIds.length ? db.select().from(attendance).where(inArray(attendance.lanId, lanIds)).all() : [];
  const seats = lanIds.length
    ? db.select({ lanId: seat.lanId, userId: seat.userId }).from(seat).where(inArray(seat.lanId, lanIds)).all()
    : [];
  const memberJoins = members.map((m) => ({ userId: m.u.id, joinedAt: m.joinedAt }));

  const asked = new Map<string, Set<string>>();
  const events: EventStats[] = lans.map((l) => {
    const r = rows.filter((a) => a.lanId === l.id);
    const ids = askedFor(l, memberJoins, r);
    asked.set(l.id, ids);
    const count = (s: AttendanceStatus) => r.filter((a) => a.status === s).length;
    const lanSeats = seats.filter((s) => s.lanId === l.id);
    return {
      lan: l,
      past: l.endsAt < now,
      asked: ids.size,
      answered: r.length,
      answeredOnTime: r.filter((a) => !l.signupDeadline || a.createdAt <= l.signupDeadline).length,
      going: count("going"),
      maybe: count("maybe"),
      declined: count("declined"),
      waitlist: count("waitlist"),
      noAnswer: Math.max(0, ids.size - r.length),
      ticketReported: r.filter((a) => a.status !== "declined" && (a.ticketBought || a.paid)).length,
      ticketConfirmed: r.filter((a) => a.status !== "declined" && a.paid).length,
      seats: lanSeats.length,
      seatsAssigned: lanSeats.filter((s) => s.userId).length,
    };
  });

  const pastLans = lans.filter((l) => l.endsAt < now);
  const memberStats: MemberStats[] = members.map(({ u, role }) => {
    const mine = rows.filter((a) => a.userId === u.id);
    const askedPast = pastLans.filter((l) => asked.get(l.id)?.has(u.id));
    const attendedLans = askedPast.filter((l) => mine.some((a) => a.lanId === l.id && a.status === "going"));
    return {
      userId: u.id,
      name: u.name,
      firstName: u.firstName,
      lastName: u.lastName,
      isGuest: u.isGuest,
      role: isMemberRole(role) ? role : "member",
      asked: askedPast.length,
      answered: askedPast.filter((l) => mine.some((a) => a.lanId === l.id)).length,
      attended: attendedLans.length,
      stayedUnsure: askedPast.filter((l) => mine.some((a) => a.lanId === l.id && a.status === "maybe")).length,
      lastAttended: attendedLans.at(-1) ?? null,
      upcomingComing: lans.filter((l) => l.endsAt >= now && mine.some((a) => a.lanId === l.id && a.status === "going"))
        .length,
    };
  });

  return { events, members: memberStats, totalMembers: members.length };
}

/** Share as a whole percent, "—" when there is nothing to divide by. */
export function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}
