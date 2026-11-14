"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { auditLan } from "@/lib/audit";
import { canViewLan, requireLanManager, requireUser } from "@/lib/session";
import { autoPlanAfterWishes } from "@/lib/seat-plan";

const { attendance, lan, seat } = schema;

/** Manage → Seats: re-plan the seats automatically whenever someone changes their wishes. */
export async function setSeatAutoPlan(lanId: string, on: boolean) {
  const me = await requireLanManager(lanId);
  db.update(lan).set({ seatAutoPlan: on }).where(eq(lan.id, lanId)).run();
  const l = db.select().from(lan).where(eq(lan.id, lanId)).get()!;
  auditLan(l, me.id, "seat.autoPlan", { data: { on } });
  // Turning it on plans right away, so the plan matches the wishes from the start.
  if (on) autoPlanAfterWishes(lanId, me.id);
  revalidatePath(`/lans/${lanId}`, "layout");
}

/**
 * A short fingerprint of the seat plan and everyone's wishes. Open seat pages poll it
 * and refresh when it changes, so leads and members see new plans and wishes live.
 */
export async function seatPlanVersion(lanId: string): Promise<string> {
  const me = await requireUser();
  if (!canViewLan(me, lanId)) throw new Error("Not found");
  const seats = db.select({ id: seat.id, userId: seat.userId, locked: seat.locked, label: seat.label }).from(seat).where(eq(seat.lanId, lanId)).all();
  const rows = db
    .select({ userId: attendance.userId, status: attendance.status, at: attendance.updatedAt })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId)))
    .all();
  const l = db.select({ p: lan.seatsPublishedAt, pick: lan.seatPicking, auto: lan.seatAutoPlan }).from(lan).where(eq(lan.id, lanId)).get();
  const text = JSON.stringify([seats, rows.map((r) => [r.userId, r.status, r.at.getTime()]), l]);
  // FNV-1a: small and good enough to tell "changed" from "same".
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}
