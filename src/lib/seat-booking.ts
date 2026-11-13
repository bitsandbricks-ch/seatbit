import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { attendance, seat } = schema;

/**
 * The leads book each member's seat on the event's own seat plan (e.g. lal.gg)
 * and tick it off per person. A new seat means booking again, so seat changes clear the tick.
 */
export function clearSeatBooked(lanId: string, userIds: (string | null | undefined)[]) {
  const ids = userIds.filter((x): x is string => !!x);
  if (ids.length === 0) return;
  db.update(attendance)
    .set({ seatBooked: false })
    .where(and(eq(attendance.lanId, lanId), inArray(attendance.userId, ids)))
    .run();
}

/** Marks a member's seat as booked on the event site (leads). Only for someone coming who has a seat. */
export function setSeatBooked(lanId: string, userId: string, booked: boolean) {
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  if (!a || a.status !== "going") throw new Error("They're not coming to this LAN.");
  const s = db.select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.userId, userId))).get();
  if (booked && !s) throw new Error("They don't have a seat yet.");
  db.update(attendance).set({ seatBooked: booked }).where(eq(attendance.id, a.id)).run();
  return s?.label ?? null;
}
