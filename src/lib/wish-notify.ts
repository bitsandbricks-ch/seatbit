import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getDisplayNames } from "./lans";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { normalizeRules, rulePeople } from "./seat-rules";
import { wishLines } from "./wish-text";

const { attendance, lan } = schema;

/**
 * A lead's edit saves on every click and drag, so the member's DM waits until the lead
 * has stopped for a minute and then shows the wishes as they ended up.
 */
export const WISH_DM_DELAY_MS = 60_000;

const g = globalThis as unknown as { __seatbitWishDms?: Map<string, ReturnType<typeof setTimeout>> };
const pending = (g.__seatbitWishDms ??= new Map());

/** Tells a member, by Discord DM only (respects their DM switch), that a lead changed their seat wishes. */
export function scheduleWishChangedDm(lanId: string, userId: string, leadId: string) {
  const key = `${lanId}:${userId}`;
  clearTimeout(pending.get(key));
  const timer = setTimeout(() => {
    pending.delete(key);
    void sendWishChangedDm(lanId, userId, leadId).catch((e) => console.error("[notify] wish DM failed", e));
  }, WISH_DM_DELAY_MS);
  timer.unref?.();
  pending.set(key, timer);
}

export async function sendWishChangedDm(lanId: string, userId: string, leadId: string) {
  const l = db.select().from(lan).where(eq(lan.id, lanId)).get();
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId))).get();
  if (!l || !a) return;
  const rules = normalizeRules(a.wishRules ?? [], userId);
  const names = await getDisplayNames(lanId, [leadId, ...rulePeople(rules)]);
  const nameOf = (id: string) => names.get(id) ?? "?";
  await notify(userId, (t) => {
    const lines = wishLines(rules, t, nameOf, l.seatNearRange);
    if (a.wishNote) lines.push(t("wishLead.dm.note", { note: a.wishNote }));
    return {
      kind: "seat_wishes_changed",
      subject: t("wishLead.dm.subject", { lan: l.name }),
      text: t("wishLead.dm.text", { lead: nameOf(leadId), lan: l.name, wishes: lines.join("\n") || t("wishLead.dm.none") }),
      url: `${appUrl}/lans/${l.id}?tab=seats`,
      dmOnly: true,
    };
  });
}
