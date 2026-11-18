import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auditLan } from "./audit";
import { lanChanged } from "./live";
import { clearSeatBooked } from "./seat-booking";
import { encodeMove, planSeats, planSeatsAsync } from "./seating";
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
 * "replan" first clears every seat that isn't held. `effort`: how hard the planner looks
 * ("extended" runs in slices, so the server keeps answering meanwhile). Returns userId -> seatId
 * of the people it seated, and the seats as they were before.
 */
export async function planAndAssign(lanId: string, mode: "fill" | "replan", effort: "quick" | "extended" = "quick") {
  const before = db.select().from(seat).where(eq(seat.lanId, lanId)).all();
  const everyone = planPeople(lanId);
  const nearRange = db.select({ r: lan.seatNearRange }).from(lan).where(eq(lan.id, lanId)).get()?.r;
  const seats = mode === "replan" ? before.map((s) => (s.locked ? s : { ...s, userId: null })) : before;
  const seated = new Set(seats.map((s) => s.userId).filter(Boolean));
  // A re-plan starts from the old plan, so people whose wishes didn't change don't move for nothing.
  const stay = mode === "replan" ? new Map(before.filter((s) => s.userId && !s.locked).map((s) => [s.userId!, s.id])) : undefined;
  const opts = { nearRange, stay, effort };
  const todo = everyone.filter((x) => !seated.has(x.userId));
  const p = effort === "quick" ? planSeats(seats, todo, everyone, opts) : await planSeatsAsync(seats, todo, everyone, opts);
  const plan = db.transaction((tx) => {
    if (mode === "replan") tx.update(seat).set({ userId: null }).where(and(eq(seat.lanId, lanId), eq(seat.locked, false))).run();
    // Seats someone held or took while a longer search ran stay as they are.
    const now = new Map(tx.select().from(seat).where(eq(seat.lanId, lanId)).all().map((s) => [s.id, s]));
    const taken = new Set([...now.values()].map((s) => s.userId).filter(Boolean));
    const done = new Map<string, string>();
    for (const [userId, seatId] of p) {
      const s = now.get(seatId);
      if (!s || s.locked || s.userId || taken.has(userId)) continue;
      tx.update(seat).set({ userId }).where(eq(seat.id, seatId)).run();
      done.set(userId, seatId);
    }
    return done;
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
export async function autoPlanAfterWishes(lanId: string, actorId: string, mode: "auto" | "replan" = "auto") {
  const l = db.select().from(lan).where(eq(lan.id, lanId)).get();
  if (!l || !l.seatAutoPlan || l.seatsPublishedAt || l.seatPicking) return false;
  const { plan, moves } = await planAndAssign(lanId, "replan");
  auditLan(l, actorId, "seat.auto", { data: { mode, count: plan.size, moves: moves.slice(0, MAX_LOGGED_MOVES) } });
  // Open seat maps and wish lists show the new plan right away, whoever triggered it.
  lanChanged(lanId);
  return true;
}
