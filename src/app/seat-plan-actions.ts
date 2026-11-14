"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { lanChanged } from "@/lib/live";
import { db, schema } from "@/db";
import { auditLan } from "@/lib/audit";
import { requireLanManager } from "@/lib/session";
import { autoPlanAfterWishes } from "@/lib/seat-plan";
import { clampNearRange } from "@/lib/seat-rules";

const { lan } = schema;

/** Manage → Seats: re-plan the seats automatically whenever someone changes their wishes. */
export async function setSeatAutoPlan(lanId: string, on: boolean) {
  const me = await requireLanManager(lanId);
  db.update(lan).set({ seatAutoPlan: on }).where(eq(lan.id, lanId)).run();
  const l = db.select().from(lan).where(eq(lan.id, lanId)).get()!;
  auditLan(l, me.id, "seat.autoPlan", { data: { on } });
  // Turning it on plans right away, so the plan matches the wishes from the start.
  // Turning it on re-plans right away: logged as a lead's re-plan, not as a wish change.
  if (on) autoPlanAfterWishes(lanId, me.id, "replan");
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}`, "layout");
}

/** Manage → Seats: how many seats apart still count as "near" for this event's seat wishes. */
export async function setSeatNearRange(lanId: string, range: number) {
  const me = await requireLanManager(lanId);
  const r = clampNearRange(range);
  const before = db.select().from(lan).where(eq(lan.id, lanId)).get()!;
  if (before.seatNearRange === r) return r;
  db.update(lan).set({ seatNearRange: r }).where(eq(lan.id, lanId)).run();
  auditLan(before, me.id, "seat.nearRange", { data: { range: r } });
  autoPlanAfterWishes(lanId, me.id, "replan");
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}`, "layout");
  return r;
}
