import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auditLan } from "./audit";
import { clearSeatBooked } from "./seat-booking";
import { encodeMove, planSeats } from "./seating";
import { normalizeRules } from "./seat-rules";

const { attendance, lan, seat } = schema;

/** Everyone coming, with their ranked wishes, as the planner wants them. */
export function planPeople(lanId: string) {
  return db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all()
    .map((a) => ({
      userId: a.userId,
      rules: normalizeRules(a.wishRules ?? [], a.userId),
      priority: a.paid ? 2 : a.ticketBought ? 1 : 0,
      order: a.createdAt.getTime(),
    }));
}

/**
 * Runs the planner and saves the result. "fill" only seats people without a seat;
 * "replan" first clears every seat that isn't held. Returns userId -> seatId of the
 * people it seated, and the seats as they were before.
 */
export function planAndAssign(lanId: string, mode: "fill" | "replan") {
  const before = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const everyone = planPeople(lanId);
  const nearRange = db.select({ r: lan.seatNearRange }).from(lan).where(eq(lan.id, lanId)).get()?.r;
  const plan = db.transaction((tx) => {
    if (mode === "replan") tx.update(seat).set({ userId: null }).where(and(eq(seat.lanId, lanId), eq(seat.locked, false))).run();
    const seats = tx.select().from(seat).where(eq(seat.lanId, lanId)).all();
    const seated = new Set(seats.map((s) => s.userId).filter(Boolean));
    const p = planSeats(seats, everyone.filter((x) => !seated.has(x.userId)), everyone, { nearRange });
    for (const [userId, seatId] of p) tx.update(seat).set({ userId }).where(eq(seat.id, seatId)).run();
    return p;
  });
  // Clear the "booked on the event site" tick only for people whose seat actually changed.
  const was = new Map(before.filter((s) => s.userId).map((s) => [s.userId!, s.id]));
  const now = new Map(
    db.select().from(seat).where(eq(seat.lanId, lanId)).all().filter((s) => s.userId).map((s) => [s.userId!, s.id]),
  );
  const moved = everyone.map((p) => p.userId).filter((u) => was.get(u) !== now.get(u));
  clearSeatBooked(lanId, moved);
  const label = new Map(before.map((s) => [s.id, s.label]));
  const moves = moved.map((u) => encodeMove({ u, from: label.get(was.get(u) ?? "") ?? null, to: label.get(now.get(u) ?? "") ?? null }));
  return { plan, seats: before, everyone, moves };
}

/** At most this many moves per log entry, so a re-plan of a huge event stays a small row. */
export const MAX_LOGGED_MOVES = 80;

/**
 * Re-plans the seats after someone changed their wishes, when the leads turned that on.
 * Only while the plan isn't final and members don't pick their own seats, so it never
 * moves a final seat or someone's own pick.
 */
export function autoPlanAfterWishes(lanId: string, actorId: string, mode: "auto" | "replan" = "auto") {
  const l = db.select().from(lan).where(eq(lan.id, lanId)).get();
  if (!l || !l.seatAutoPlan || l.seatsPublishedAt || l.seatPicking) return false;
  const { plan, moves } = planAndAssign(lanId, "replan");
  auditLan(l, actorId, "seat.auto", { data: { mode, count: plan.size, moves: moves.slice(0, MAX_LOGGED_MOVES) } });
  return true;
}
