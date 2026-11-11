import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { appUrl } from "./mail";
import { notify } from "./notify";

const { attendance, seat, user, reminderLog } = schema;

/**
 * Members book the seat the orgas gave them on the event's own seat plan
 * (e.g. lal.gg) themselves, then tick "I booked it". A new seat means booking
 * again, so seat changes clear the tick.
 */
export function clearSeatBooked(lanId: string, userIds: (string | null | undefined)[]) {
  const ids = userIds.filter((x): x is string => !!x);
  if (ids.length === 0) return;
  db.update(attendance)
    .set({ seatBooked: false })
    .where(and(eq(attendance.lanId, lanId), inArray(attendance.userId, ids)))
    .run();
}

/** Discord button that ticks "I booked it" straight from a DM. */
export const bookedButton = (lanId: string) => ({ type: 2, style: 3, label: "I booked it", custom_id: `booked:${lanId}` });

/** One line for mails and DMs: where to book the seat. Empty when the event has no seat plan link. */
export function bookingLine(l: Pick<Lan, "externalPlanUrl">, label: string | null | undefined) {
  if (!l.externalPlanUrl || !label) return "";
  return `Book seat ${label} on the event's seat plan (${l.externalPlanUrl}), then tick "I booked it" in Seatbit.`;
}

/** Attendees who have a seat but haven't ticked that they booked it on the event site. */
export function unbookedSeated(l: Lan): { u: User; label: string }[] {
  if (!l.externalPlanUrl) return [];
  return db
    .select({ u: user, label: seat.label, booked: attendance.seatBooked, status: attendance.status })
    .from(seat)
    .innerJoin(user, eq(user.id, seat.userId))
    .innerJoin(attendance, and(eq(attendance.lanId, seat.lanId), eq(attendance.userId, seat.userId)))
    .where(eq(seat.lanId, l.id))
    .all()
    .filter((r) => r.status === "going" && !r.booked)
    .map((r) => ({ u: r.u, label: r.label }));
}

/** Reminds everyone with an unbooked seat (orga button). Returns how many got it. */
export async function remindToBook(l: Lan) {
  let sent = 0;
  for (const { u, label } of unbookedSeated(l)) {
    const r = await notify(u, {
      kind: "reminder",
      subject: `${l.name}: book seat ${label}`,
      text: `Hi ${u.name},\n\nyour seat at ${l.name} is ${label}. Please book it on the event's seat plan:\n${l.externalPlanUrl}\n\nThen tick "I booked it" in Seatbit, so the orgas know.\n\n${appUrl}/lans/${l.id}`,
      url: `${appUrl}/lans/${l.id}`,
      buttons: [bookedButton(l.id), { type: 2, style: 5, label: "Event seat plan", url: l.externalPlanUrl }],
    }).catch(() => ({ email: false, dm: false }));
    if (r.email || r.dm) {
      sent++;
      db.insert(reminderLog)
        .values({ lanId: l.id, userId: u.id, kind: "book_seat" })
        .onConflictDoUpdate({
          target: [reminderLog.lanId, reminderLog.userId, reminderLog.kind],
          set: { sentAt: new Date() },
        })
        .run();
    }
  }
  return sent;
}

/** Sets a member's "I booked it". Only for someone coming who has a seat. */
export function setSeatBooked(lanId: string, userId: string, booked: boolean) {
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  if (!a || a.status !== "going") throw new Error("You're not coming to this LAN.");
  const s = db.select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.userId, userId))).get();
  if (booked && !s) throw new Error("You don't have a seat yet.");
  db.update(attendance).set({ seatBooked: booked }).where(eq(attendance.id, a.id)).run();
  return s?.label ?? null;
}
