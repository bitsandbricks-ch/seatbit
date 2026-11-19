"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { err, tr } from "@/i18n/server";
import { audit } from "@/lib/audit";
import { clanRole, getClan } from "@/lib/clans";
import { isMemberRole } from "@/lib/clan-roles";
import { mergeGuestInto } from "@/lib/guest-claim";
import { lanChanged } from "@/lib/live";
import { appUrl } from "@/lib/mail";
import { notify, notifyLater } from "@/lib/notify";
import { platformCan } from "@/lib/platform-roles";
import { requireClanPermission } from "@/lib/session";
import type { ActionResult } from "@/app/admin/settings/actions";

/**
 * A clan admin (or platform staff) says a guest is a real account: answers, seats, nicks and
 * the rest move over, like when the person claims the guest themselves.
 * Clan admins pick from the clan's members; platform staff may pick any account.
 */
export async function linkGuestToMember(clanId: string, guestId: string, memberId: string): Promise<ActionResult> {
  const me = await requireClanPermission(clanId, "members");
  const c = getClan(clanId);
  const g = db.select().from(schema.user).where(eq(schema.user.id, guestId)).get();
  if (!c || !g?.isGuest || g.guestClanId !== clanId) throw await err("guestLink.guestGone");
  const target = db.select().from(schema.user).where(eq(schema.user.id, memberId)).get();
  if (!target || target.isGuest || target.deletedAt) throw await err("guestLink.noAccount");
  if (!platformCan(me, "clans") && !isMemberRole(clanRole(target.id, clanId))) throw await err("guestLink.notMember");

  const lanIds = db
    .select({ lanId: schema.attendance.lanId })
    .from(schema.attendance)
    .where(eq(schema.attendance.userId, g.id))
    .all()
    .map((r) => r.lanId);
  audit({ actorId: me.id, action: "guest.merged", clanId, targetUserId: target.id, data: { guest: g.name } });
  mergeGuestInto(g, target.id);
  for (const id of lanIds) lanChanged(id);

  if (target.id !== me.id)
    notifyLater(() =>
      notify(target.id, (t) => ({
        kind: "guest_linked",
        subject: t("notice.tookOver", { guest: g.name, clan: c.name }),
        text: `${t("notice.linkedText", { guest: g.name, clan: c.name })}\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      })),
    );
  revalidatePath("/", "layout");
  return { ok: true, message: await tr("guestLink.done", { guest: g.name, name: target.name }), at: Date.now() };
}
