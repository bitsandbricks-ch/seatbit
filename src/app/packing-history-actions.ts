"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { err } from "@/i18n/server";
import { lanChanged } from "@/lib/live";
import { MAX_PACKING_ITEMS } from "@/lib/gear";
import { pastPackingItems } from "@/lib/packing-history";
import { canTakePart, requireUser } from "@/lib/session";

const { packingItem } = schema;

/** Puts everything from my earlier packing lists on this one, up to the usual cap. */
export async function addPastPackingItems(lanId: string) {
  const me = await requireUser();
  if (!canTakePart(me, lanId)) throw await err("errors.eventGone");
  const mine = db
    .select({ id: packingItem.id })
    .from(packingItem)
    .where(and(eq(packingItem.lanId, lanId), eq(packingItem.userId, me.id)))
    .all().length;
  const room = MAX_PACKING_ITEMS - mine;
  if (room <= 0) throw await err("errors.packingMax", { count: MAX_PACKING_ITEMS });
  const labels = pastPackingItems(me.id, lanId, room);
  if (!labels.length) return;
  db.insert(packingItem)
    .values(labels.map((label) => ({ lanId, userId: me.id, label })))
    .run();
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}`);
}
