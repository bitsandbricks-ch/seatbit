"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { allTypes, clanTypes } from "@/lib/lan-types";
import { err, tr } from "@/i18n/server";
import { audit } from "@/lib/audit";
import { LAN_ID_MAX, saveLanAccount } from "@/lib/lan-accounts";
import { lanChanged } from "@/lib/live";
import { saveNick } from "@/lib/member-updates";
import { assertPlatform, requireClanPermission } from "@/lib/session";
import type { FormState } from "./actions";

/**
 * Clan admins and recruiters (and platform owners/admins, who manage every clan) set a member's
 * nick and LAN ID for each of the clan's LAN types, e.g. when someone gave them their ticket number.
 * Guests go through updateGuest. Only fields in the form change; every change is audit-logged.
 */
export async function updateMemberLanInfo(clanId: string, userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "members");
  const m = db
    .select()
    .from(schema.clanMember)
    .where(and(eq(schema.clanMember.clanId, clanId), eq(schema.clanMember.userId, userId)))
    .get();
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!m || m.role === "pending" || !u || u.deletedAt) throw await err("errors.gone");

  const changed = await applyLanInfo(userId, clanTypes(clanId), formData);
  if (!Array.isArray(changed)) return changed;
  if (changed.length === 0) return { ok: true };

  const fields = [changed.some((c) => c.nick) && "nicks", changed.some((c) => c.lanId) && "LAN IDs"].filter((f): f is string => !!f);
  audit({ actorId: me.id, action: "member.lan_info", clanId, targetUserId: userId, data: { fields, types: changed.map((c) => c.type) } });
  // Nicks show on the clan's event pages, so open ones refresh.
  const now = new Date();
  for (const l of db.select({ id: schema.lan.id, endsAt: schema.lan.endsAt }).from(schema.lan).where(eq(schema.lan.clanId, clanId)).all())
    if (l.endsAt >= now) lanChanged(l.id);
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Platform owners and admins set anyone's nick and LAN ID for every LAN type at once (types are
 * global, so this isn't tied to one clan). Audit-logged like the clan version.
 */
export async function updateUserLanInfo(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await assertPlatform("clans");
  const u = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!u || u.deletedAt || u.isGuest) throw await err("errors.gone");
  const changed = await applyLanInfo(userId, allTypes(), formData);
  if (!Array.isArray(changed)) return changed;
  if (changed.length === 0) return { ok: true };
  const fields = [changed.some((c) => c.nick) && "nicks", changed.some((c) => c.lanId) && "LAN IDs"].filter((f): f is string => !!f);
  audit({ actorId: me.id, action: "member.lan_info", targetUserId: userId, data: { fields, types: changed.map((c) => c.type) } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Saves the nick_<type> and lanId_<type> fields the form has; returns what changed, or an error. */
async function applyLanInfo(userId: string, types: { id: string; name: string }[], formData: FormData) {
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, userId)).all();
  const ids = db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, userId)).all();
  const nickOf = (typeId: string) => {
    const ns = nicks.filter((n) => n.typeId === typeId && !n.lanId);
    return (ns.find((n) => n.isPrimary) ?? ns[0])?.nick ?? "";
  };
  const idOf = (typeId: string) => ids.find((a) => a.typeId === typeId && !a.lanId)?.value ?? "";

  const changed: { type: string; nick?: boolean; lanId?: boolean }[] = [];
  for (const t of types) {
    const nick = formData.has(`nick_${t.id}`) ? String(formData.get(`nick_${t.id}`)).trim() : null;
    const lanId = formData.has(`lanId_${t.id}`) ? String(formData.get(`lanId_${t.id}`)).trim().slice(0, LAN_ID_MAX) : null;
    if (nick !== null && nick.length > 32) return { error: await tr("errors.nickLength") };
    const row = { type: t.name, nick: nick !== null && nick !== nickOf(t.id), lanId: lanId !== null && lanId !== idOf(t.id) };
    if (row.nick) saveNick(userId, nick!, { typeId: t.id, lanId: null });
    if (row.lanId) saveLanAccount(userId, { lanId: null, typeId: t.id }, lanId!);
    if (row.nick || row.lanId) changed.push(row);
  }
  return changed;
}
