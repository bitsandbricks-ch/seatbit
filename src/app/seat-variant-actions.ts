"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { auditLan } from "@/lib/audit";
import { lanChanged } from "@/lib/live";
import { mustGetLan } from "@/lib/lans";
import { notifyLater, notifySeatChanged } from "@/lib/notify";
import { MAX_LOGGED_MOVES } from "@/lib/seat-plan";
import { encodeMove } from "@/lib/seating";
import { applyArrangement, listVariants, liveArrangement, planArrangement } from "@/lib/seat-variants";
import { MAX_VARIANTS, cleanVariantName, nextVariantName, type Arrangement } from "@/lib/seat-variant-math";
import { requireLanManager } from "@/lib/session";
import { err, tr } from "@/i18n/server";

// Manage → Seats → Variants: the leads save seat arrangements under a name, compare them and
// apply one as the live plan. Variants are lead-only drafts; only applying changes what members see.

const { seatVariant } = schema;

const managePath = (lanId: string) => revalidatePath(`/lans/${lanId}/manage`);

async function variantOf(variantId: string) {
  const v = db.select().from(seatVariant).where(eq(seatVariant.id, variantId)).get();
  if (!v) throw await err("errors.noVariant");
  return v;
}

async function create(lanId: string, actorId: string, name: string, seats: Arrangement, from: "plan" | "wishes") {
  const taken = listVariants(lanId);
  if (taken.length >= MAX_VARIANTS) throw await err("errors.tooManyVariants", { max: MAX_VARIANTS });
  const n = cleanVariantName(name) || nextVariantName(taken.map((v) => v.name), await tr("seatVariants.defaultName"));
  const v = db.insert(seatVariant).values({ lanId, name: n, seats, createdBy: actorId }).returning().get();
  auditLan(mustGetLan(lanId), actorId, "seat.variantSave", { data: { name: n, from, count: Object.keys(seats).length } });
  managePath(lanId);
  return { id: v.id, name: n };
}

/** Saves who sits where right now as a new variant. An empty name becomes "Variant 3". */
export async function saveSeatVariant(lanId: string, name: string) {
  const me = await requireLanManager(lanId);
  return create(lanId, me.id, String(name ?? ""), liveArrangement(lanId), "plan");
}

/** Lets the planner seat everyone from their wishes into a new variant; the live seats stay as they are. */
export async function planSeatVariant(lanId: string, name: string) {
  const me = await requireLanManager(lanId);
  return create(lanId, me.id, String(name ?? ""), planArrangement(lanId), "wishes");
}

/** Overwrites a variant with the live plan (after the leads changed it on the map). */
export async function updateSeatVariant(variantId: string) {
  const v = await variantOf(variantId);
  const me = await requireLanManager(v.lanId);
  const seats = liveArrangement(v.lanId);
  db.update(seatVariant).set({ seats, updatedAt: new Date() }).where(eq(seatVariant.id, v.id)).run();
  auditLan(mustGetLan(v.lanId), me.id, "seat.variantUpdate", { data: { name: v.name, count: Object.keys(seats).length } });
  managePath(v.lanId);
}

export async function renameSeatVariant(variantId: string, name: string) {
  const v = await variantOf(variantId);
  await requireLanManager(v.lanId);
  const n = cleanVariantName(String(name ?? ""));
  if (!n) throw await err("errors.variantName");
  db.update(seatVariant).set({ name: n }).where(and(eq(seatVariant.id, v.id), eq(seatVariant.lanId, v.lanId))).run();
  managePath(v.lanId);
  return n;
}

export async function deleteSeatVariant(variantId: string) {
  const v = await variantOf(variantId);
  const me = await requireLanManager(v.lanId);
  db.delete(seatVariant).where(eq(seatVariant.id, v.id)).run();
  auditLan(mustGetLan(v.lanId), me.id, "seat.variantDelete", { data: { name: v.name } });
  managePath(v.lanId);
}

/**
 * Makes a variant the live seat plan. Like a re-plan: the "booked on the event site" tick goes for
 * everyone who moved, and only once the plan is final do they hear about their new seat.
 * Returns how many people moved.
 */
export async function applySeatVariant(variantId: string): Promise<number> {
  const v = await variantOf(variantId);
  const me = await requireLanManager(v.lanId);
  const moves = applyArrangement(v.lanId, v.seats);
  const l = mustGetLan(v.lanId);
  auditLan(l, me.id, "seat.variantApply", {
    data: { name: v.name, count: moves.length, moves: moves.slice(0, MAX_LOGGED_MOVES).map(encodeMove) },
  });
  lanChanged(v.lanId);
  revalidatePath(`/lans/${v.lanId}`);
  managePath(v.lanId);
  revalidatePath("/");
  if (l.seatsPublishedAt) notifyLater(async () => {
    for (const m of moves) await notifySeatChanged(l, m.u, m.to);
  });
  return moves.length;
}
