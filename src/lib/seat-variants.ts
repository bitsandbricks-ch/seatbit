import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { clearSeatBooked } from "./seat-booking";
import { planPeople } from "./seat-plan";
import { planSeats } from "./seating";
import { arrangementOf, movesBetween, seatsWithVariant, type Arrangement } from "./seat-variant-math";

const { attendance, lan, seat, seatVariant } = schema;

export function listVariants(lanId: string) {
  return db.select().from(seatVariant).where(eq(seatVariant.lanId, lanId)).orderBy(asc(seatVariant.createdAt)).all();
}

/** Everyone coming: only they get a seat from a variant. */
export function comingIds(lanId: string) {
  return new Set(
    db
      .select({ u: attendance.userId })
      .from(attendance)
      .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
      .all()
      .map((r) => r.u),
  );
}

export const liveArrangement = (lanId: string) => arrangementOf(db.select().from(seat).where(eq(seat.lanId, lanId)).all());

/**
 * A fresh plan from everyone's seat wishes, without touching the live seats. Held seats keep
 * whoever sits there, like "Re-plan everyone"; unlike it, nobody's current seat counts, so the
 * leads get a real alternative to compare against their hand-made plan.
 */
export function planArrangement(lanId: string): Arrangement {
  const seats = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const everyone = planPeople(lanId);
  const nearRange = db.select({ r: lan.seatNearRange }).from(lan).where(eq(lan.id, lanId)).get()?.r;
  const kept = seats.map((s) => (s.locked ? s : { ...s, userId: null }));
  const seated = new Set(kept.map((s) => s.userId).filter(Boolean));
  const plan = planSeats(kept, everyone.filter((p) => !seated.has(p.userId)), everyone, { nearRange });
  const label = new Map(seats.map((s) => [s.id, s.label]));
  const out = arrangementOf(kept);
  for (const [userId, seatId] of plan) out[label.get(seatId)!] = userId;
  return out;
}

/**
 * Makes a variant the live plan: every seat gets the variant's person, or none. Clears the
 * "booked on the event site" tick of everyone who moved. Returns the moves.
 */
export function applyArrangement(lanId: string, arrangement: Arrangement) {
  const before = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const after = seatsWithVariant(before, arrangement, comingIds(lanId));
  db.transaction((tx) => {
    // (lan, user) is unique: empty every seat first, then fill them.
    tx.update(seat).set({ userId: null }).where(eq(seat.lanId, lanId)).run();
    for (const s of after) if (s.userId) tx.update(seat).set({ userId: s.userId }).where(eq(seat.id, s.id)).run();
  });
  const moves = movesBetween(before, after);
  clearSeatBooked(
    lanId,
    moves.map((m) => m.u),
  );
  return moves;
}
