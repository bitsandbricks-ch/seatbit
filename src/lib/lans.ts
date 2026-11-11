import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus, Lan, Nickname } from "@/db/schema";
import { appUrl } from "./mail";
import { sendTemplate } from "./mail-templates";
import { fmtDate } from "./format";

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

/** Map userId -> display nick for a LAN. */
export async function getDisplayNames(lanId: string, userIds: string[]) {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const typeId = getLan(lanId)?.typeId ?? null;
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
    map.set(u.id, pickNick(nicks.filter((n) => n.userId === u.id), { lanId, typeId }, u.name));
  }
  return map;
}

export function goingCount(lanId: string) {
  return db
    .select({ id: attendance.id })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all().length;
}

export function signupClosed(l: Lan, now = new Date()) {
  return (l.signupDeadline && l.signupDeadline < now) || l.endsAt < now;
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
    await sendTemplate(u.email, "waitlistPromoted", {
      firstName: u.firstName || u.name,
      lan: l.name,
      start: fmtDate(l.startsAt),
      location: l.location,
      link: `${appUrl}/lans/${l.id}`,
    }).catch((e) => console.error("[mail] failed", e));
  }
}

export function getLan(id: string) {
  return db.select().from(lan).where(eq(lan.id, id)).get();
}
