import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db, schema } from "@/db";

const { packingItem, lan } = schema;

/**
 * Things a person added to their own packing list at earlier LANs and hasn't got on this
 * one yet, newest first, so a regular doesn't type "Spare mouse" in again every time.
 */
export function pastPackingItems(userId: string, lanId: string, limit = 15): string[] {
  const here = db.select({ startsAt: lan.startsAt }).from(lan).where(eq(lan.id, lanId)).get();
  if (!here) return [];
  const have = new Set(
    db
      .select({ label: packingItem.label })
      .from(packingItem)
      .where(and(eq(packingItem.lanId, lanId), eq(packingItem.userId, userId)))
      .all()
      .map((r) => r.label.trim().toLowerCase()),
  );
  const rows = db
    .select({ label: packingItem.label })
    .from(packingItem)
    .innerJoin(lan, eq(lan.id, packingItem.lanId))
    .where(and(eq(packingItem.userId, userId), ne(packingItem.lanId, lanId), lt(lan.startsAt, here.startsAt)))
    .orderBy(desc(lan.startsAt), desc(packingItem.createdAt))
    .all();
  const out: string[] = [];
  for (const { label } of rows) {
    const k = label.trim().toLowerCase();
    if (have.has(k)) continue;
    have.add(k);
    out.push(label);
    if (out.length >= limit) break;
  }
  return out;
}
