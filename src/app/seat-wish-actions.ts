"use server";
import { and, desc, eq, gt } from "drizzle-orm";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { auditLan } from "@/lib/audit";
import { mustGetLan } from "@/lib/lans";
import { saveSeatWishes, type wishInput } from "@/lib/member-updates";
import { autoPlanAfterWishes } from "@/lib/seat-plan";
import { requireLanManager } from "@/lib/session";
import { cancelWishChangedDm, scheduleWishChangedDm } from "@/lib/wish-notify";
import { err, getT } from "@/i18n/server";

const { auditLog } = schema;

/** One log line per lead editing session, not one per click: edits within this window join the last entry. */
const LOG_WINDOW_MS = 10 * 60_000;

/**
 * Manage → Seats: a lead changes a member's seat wishes (e.g. told in person). With `dm`, the
 * member gets a Discord DM with the result once the lead stops editing; off by default, as the
 * lead often just enters what the member asked for.
 */
export async function setMemberSeatWishes(lanId: string, userId: string, input: z.input<typeof wishInput>, dm = false) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (l.seatsPublishedAt) throw await err("errors.planFinalAsk");
  const sendDm = dm === true;
  const changed = saveSeatWishes(lanId, userId, input, await getT(), me.id);
  // Ticking the DM box (also after the edits) sends one; unticking drops the one still waiting.
  if (!sendDm) cancelWishChangedDm(lanId, userId);
  else if (userId !== me.id) scheduleWishChangedDm(lanId, userId, me.id);
  if (!changed) return;
  const recent = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.lanId, lanId),
        eq(auditLog.action, "seat.wishes"),
        eq(auditLog.actorId, me.id),
        eq(auditLog.targetUserId, userId),
        gt(auditLog.at, new Date(Date.now() - LOG_WINDOW_MS)),
      ),
    )
    .orderBy(desc(auditLog.at))
    .get();
  if (!recent) auditLan(l, me.id, "seat.wishes", { targetUserId: userId });
  await autoPlanAfterWishes(lanId, me.id);
  revalidatePath(`/lans/${lanId}`);
  revalidatePath(`/lans/${lanId}/manage`);
}
