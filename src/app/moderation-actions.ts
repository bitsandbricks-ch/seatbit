"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { REPORT_REASONS, REPORT_STATUSES, type ReportReason, type ReportStatus } from "@/db/schema";
import { err, tr } from "@/i18n/server";
import { audit } from "@/lib/audit";
import { getClan } from "@/lib/clans";
import { canSetRole, isPlatformRole, outranks } from "@/lib/platform-roles";
import { closeReport, fileReport, suspendClan, suspendUser, unsuspendClan, unsuspendUser } from "@/lib/reports";
import { assertPlatform, canViewLan, requireUser } from "@/lib/session";

export type ReportState = { ok?: boolean; error?: string } | undefined;

/** "Report" on a clan or event page. Any signed-in person who can see it may report it. */
export async function reportContent(_: ReportState, form: FormData): Promise<ReportState> {
  const me = await requireUser();
  const lanId = String(form.get("lanId") ?? "") || null;
  const clanId = String(form.get("clanId") ?? "") || null;
  const reason = String(form.get("reason") ?? "");
  const message = String(form.get("message") ?? "");
  if (!(REPORT_REASONS as readonly string[]).includes(reason)) return { error: await tr("report.pickReason") };
  if (reason === "other" && !message.trim()) return { error: await tr("report.needMessage") };
  if (lanId && !canViewLan(me, lanId)) return { error: await tr("report.notFound") };
  const r = fileReport({ reporterId: me.id, lanId, clanId, reason: reason as ReportReason, message });
  if (!r.ok) return { error: await tr(`report.${r.reason}`) };
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setPlatformRole(userId: string, form: FormData) {
  const role = String(form.get("role") ?? "");
  const me = await assertPlatform("roles");
  const target = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!target || target.isGuest || target.deletedAt || !isPlatformRole(role) || !canSetRole(me, target, role))
    throw await err("errors.perm.platform");
  if (target.role === role) return;
  db.update(schema.user).set({ role }).where(eq(schema.user.id, userId)).run();
  audit({ actorId: me.id, action: "platform.role", targetUserId: userId, data: { from: target.role, to: role } });
  revalidatePath("/admin", "layout");
}

export async function suspendUserAction(userId: string, form: FormData) {
  const me = await assertPlatform("suspend");
  const target = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  // Staff can't suspend themselves or someone with the same or a higher role.
  if (!target || target.isGuest || target.id === me.id || !outranks(me, target)) throw await err("errors.perm.platform");
  suspendUser(userId, me.id, String(form.get("reason") ?? ""));
  revalidatePath("/admin", "layout");
}

export async function unsuspendUserAction(userId: string) {
  const me = await assertPlatform("suspend");
  unsuspendUser(userId, me.id);
  revalidatePath("/admin", "layout");
}

export async function suspendClanAction(clanId: string, form: FormData) {
  const me = await assertPlatform("suspend");
  if (!getClan(clanId)) throw await err("errors.perm.platform");
  suspendClan(clanId, me.id, String(form.get("reason") ?? ""));
  revalidatePath("/", "layout");
}

export async function unsuspendClanAction(clanId: string) {
  const me = await assertPlatform("suspend");
  unsuspendClan(clanId, me.id);
  revalidatePath("/", "layout");
}

/** Resolve, dismiss or reopen a report, with an optional note for the other moderators. */
export async function updateReport(id: string, status: string, form: FormData) {
  const me = await assertPlatform("reports");
  if (!(REPORT_STATUSES as readonly string[]).includes(status)) throw await err("errors.perm.platform");
  closeReport(id, me.id, status as ReportStatus, String(form.get("note") ?? ""));
  revalidatePath("/admin", "layout");
}
