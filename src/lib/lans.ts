import { and, asc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus, Lan, Nickname } from "@/db/schema";
import { appUrl, sendMail } from "./mail";

const { attendance, nickname, seat, user, lan } = schema;

/** Row letter for seat labels: 0 -> A, 25 -> Z, 26 -> AA. */
export function rowLetter(row: number): string {
  let s = "";
  let n = row;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function seatLabel(row: number, col: number) {
  return `${rowLetter(row)}${col + 1}`;
}

/**
 * Picks the nick shown for a user at a LAN: primary LAN nick, any LAN nick,
 * primary global nick, any global nick, then the account name.
 */
export function pickNick(nicks: Nickname[], lanId: string | null, fallback: string) {
  const forLan = nicks.filter((n) => lanId && n.lanId === lanId);
  const global = nicks.filter((n) => n.lanId === null);
  return (
    forLan.find((n) => n.isPrimary)?.nick ??
    forLan[0]?.nick ??
    global.find((n) => n.isPrimary)?.nick ??
    global[0]?.nick ??
    fallback
  );
}

/** Map userId -> display nick for a LAN. */
export async function getDisplayNames(lanId: string, userIds: string[]) {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const [users, nicks] = await Promise.all([
    db.select().from(user).where(inArray(user.id, userIds)),
    db
      .select()
      .from(nickname)
      .where(
        and(
          inArray(nickname.userId, userIds),
          or(isNull(nickname.lanId), eq(nickname.lanId, lanId)),
        ),
      ),
  ]);
  for (const u of users) {
    map.set(
      u.id,
      pickNick(
        nicks.filter((n) => n.userId === u.id),
        lanId,
        u.name,
      ),
    );
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
    await sendMail(
      u.email,
      `You're in: ${l.name}`,
      `Hi ${u.name},\n\na spot opened up and you moved from the waitlist to "going" for ${l.name}.\n\nPick your seat: ${appUrl}/lans/${l.id}`,
    ).catch((e) => console.error("[mail] failed", e));
  }
}

/** Drops seats that no longer fit after the grid was made smaller. */
export function trimSeatGrid(lanId: string, rows: number, cols: number) {
  db.delete(seat)
    .where(and(eq(seat.lanId, lanId), or(gte(seat.row, rows), gte(seat.col, cols))))
    .run();
}

export function getLan(id: string) {
  return db.select().from(lan).where(eq(lan.id, id)).get();
}
