import "server-only";
import { and, desc, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AuditEntry } from "@/db/schema";
import { fmtDay, fmtMoney } from "./format";
import { getDefaultNames } from "./lans";
import { isMemberRole, type MemberRole } from "./clan-roles";
import { STAFF_ROLES, type StaffRole } from "./platform-roles";

const isStaffRole = (r: unknown): r is StaffRole => (STAFF_ROLES as readonly unknown[]).includes(r);
import { makeT, type T } from "../i18n/translate";

const { auditLog } = schema;

/** How long entries are kept. Mentioned in the privacy policy. */
export const AUDIT_KEEP_DAYS = 365;

type Data = Record<string, string | number | boolean | null | string[] | undefined>;

export type AuditInput = {
  /** Who did it (null for the system, e.g. a scheduled publish). */
  actorId: string | null;
  action: string;
  clanId?: string | null;
  lanId?: string | null;
  targetUserId?: string | null;
  data?: Data;
};

let lastPrune = 0;

/**
 * Writes an audit log entry. Never throws: a failed log line must not break the change itself.
 * Keep `data` free of personal details (no names, no emails): names are looked up when shown.
 */
export function audit(e: AuditInput) {
  try {
    const data = Object.fromEntries(Object.entries(e.data ?? {}).filter(([, v]) => v !== undefined));
    db.insert(auditLog)
      .values({
        actorId: e.actorId,
        action: e.action,
        clanId: e.clanId ?? null,
        lanId: e.lanId ?? null,
        targetUserId: e.targetUserId ?? null,
        data,
      })
      .run();
    if (Date.now() - lastPrune > 3600_000) {
      lastPrune = Date.now();
      db.delete(auditLog)
        .where(lt(auditLog.at, new Date(Date.now() - AUDIT_KEEP_DAYS * 86400_000)))
        .run();
    }
  } catch (err) {
    console.error("[audit] failed to write %s", e.action, err);
  }
}

/** Audit helper for an event: fills in its clan and name. */
export function auditLan(
  l: { id: string; clanId: string | null; name: string },
  actorId: string | null,
  action: string,
  extra: { targetUserId?: string | null; data?: Data } = {},
) {
  audit({ actorId, action, clanId: l.clanId, lanId: l.id, targetUserId: extra.targetUserId, data: { event: l.name, ...extra.data } });
}

/** Which fields differ between two objects (for "changed the date, capacity"). */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>, labels: Partial<Record<keyof T, string>>) {
  const out: string[] = [];
  for (const [k, label] of Object.entries(labels) as [keyof T, string][]) {
    if (!(k in after)) continue;
    const a = before[k];
    const b = after[k];
    const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v ?? null);
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b)) && !out.includes(label)) out.push(label);
  }
  return out;
}

// ---------- Reading ----------

export const AUDIT_GROUPS = {
  events: { prefixes: ["event.", "lead.", "news."] },
  attendance: { prefixes: ["attendance.", "waitlist.", "ticket.", "lanid.", "arrived.", "seatbooked.", "emergency."] },
  seats: { prefixes: ["seat.", "seats.", "swap."] },
  members: { prefixes: ["member.", "invite.", "clan.", "platform.", "account.", "user.", "report."] },
  guests: { prefixes: ["guest."] },
  settings: { prefixes: ["type.", "discord.", "settings.", "mail_template.", "backup."] },
  payments: { prefixes: ["payment."] },
} as const;
export type AuditGroup = keyof typeof AUDIT_GROUPS;

export const AUDIT_PAGE_SIZE = 50;

/**
 * One page of entries, newest first. `clanId` undefined = everything (platform admins);
 * null = only platform-wide entries.
 */
export function auditEntries(opts: { clanId?: string | null; lanId?: string; group?: AuditGroup; page?: number }) {
  const where: SQL[] = [];
  if (opts.clanId === null) where.push(isNull(auditLog.clanId));
  else if (opts.clanId) where.push(eq(auditLog.clanId, opts.clanId));
  if (opts.lanId) where.push(eq(auditLog.lanId, opts.lanId));
  const all = db
    .select({ id: auditLog.id, action: auditLog.action })
    .from(auditLog)
    .where(where.length ? and(...where) : undefined)
    .all();
  // Group filter in JS: prefixes don't map to one SQL LIKE and the log stays small (one year).
  const prefixes: readonly string[] | undefined = opts.group ? AUDIT_GROUPS[opts.group].prefixes : undefined;
  const ids = prefixes ? all.filter((r) => prefixes.some((p) => r.action.startsWith(p))).map((r) => r.id) : null;
  const total = ids ? ids.length : all.length;
  const page = Math.max(0, opts.page ?? 0);
  const filter = ids ? (ids.length ? inArray(auditLog.id, ids) : eq(auditLog.id, "")) : undefined;
  const rows = db
    .select()
    .from(auditLog)
    .where(and(...where, ...(filter ? [filter] : [])))
    .orderBy(desc(auditLog.at))
    .limit(AUDIT_PAGE_SIZE)
    .offset(page * AUDIT_PAGE_SIZE)
    .all();
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** Events that appear in a clan's log, for the filter. */
export function auditedEvents(clanId: string) {
  const ids = db
    .selectDistinct({ lanId: auditLog.lanId })
    .from(auditLog)
    .where(eq(auditLog.clanId, clanId))
    .all()
    .map((r) => r.lanId)
    .filter((x): x is string => !!x);
  return ids.length
    ? db.select({ id: schema.lan.id, name: schema.lan.name, startsAt: schema.lan.startsAt }).from(schema.lan).where(inArray(schema.lan.id, ids)).orderBy(desc(schema.lan.startsAt)).all()
    : [];
}

/** Names for the people in a page of entries. Removed guests (row gone) show as "a removed guest". */
export function auditNames(rows: AuditEntry[], someone = "someone") {
  const ids = rows.flatMap((r) => [r.actorId, r.targetUserId, typeof r.data.otherUserId === "string" ? r.data.otherUserId : null]);
  const names = getDefaultNames(ids.filter((x): x is string => !!x));
  return (id: string | null | undefined, fallback = someone) => (id ? names.get(id)?.full ?? fallback : fallback);
}

const STATUS = ["going", "maybe", "declined", "waitlist"] as const;

/**
 * What happened, as a sentence without the actor ("moved Anna "Pixel" Muster from F3 to F7").
 * `name` resolves user ids; the event is named by the caller where it's shown.
 */
export function describeAudit(
  e: AuditEntry,
  name: (id: string | null | undefined, fallback?: string) => string,
  t: T = makeT("en"),
): string {
  const d = e.data as Record<string, unknown>;
  const removed = t("audit.removedPerson");
  const who = name(e.targetUserId, removed);
  const other = name(d.otherUserId as string | undefined, removed);
  const at = d.event ? t("audit.at", { event: String(d.event) }) : "";
  const st = (v: unknown) =>
    typeof v === "string" ? ((STATUS as readonly string[]).includes(v) ? t(`audit.status.${v as (typeof STATUS)[number]}`) : v) : t("audit.status.none");
  const list = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : t("audit.details"));
  const role = (r: unknown) => (isMemberRole(String(r)) ? t(`roleA.${String(r) as MemberRole}`) : String(r));
  const v = { ...d, who, other, at, event: d.event as string } as Record<string, string | number>;
  const via = d.via === "discord" ? t("audit.onDiscord") : "";
  const match = d.match ? t(d.match === "nick" ? "audit.sameNick" : "audit.sameName") : "";
  switch (e.action) {
    case "event.create":
      return t("audit.eventCreate", v);
    case "event.update":
      return t("audit.eventUpdate", { ...v, fields: list(d.fields) });
    case "event.publish":
      return t(d.scheduled ? "audit.eventPublishScheduled" : "audit.eventPublish", v);
    case "event.schedule":
      return t(d.at ? "audit.eventSchedule" : "audit.eventUnschedule", { ...v, at: String(d.at ?? "") });
    case "event.signup_open":
      return t("audit.signupOpen", v);
    case "event.cancel":
      return t(d.reason ? "audit.cancelReason" : "audit.cancel", v);
    case "event.uncancel":
      return t("audit.uncancel", v);
    case "event.delete":
      return t("audit.eventDelete", v);
    case "event.copy":
      return t("audit.eventCopy", v);
    case "orga.add":
      return t("audit.orgaAdd", v);
    case "orga.remove":
      return t("audit.orgaRemove", v);
    case "lead.task_done":
      return t("audit.leadTaskDone", v);
    case "lead.task_undone":
      return t("audit.leadTaskUndone", v);
    case "lead.task_assign":
      return t(e.targetUserId ? "audit.leadTaskAssign" : "audit.leadTaskUnassign", { ...v, who: name(e.targetUserId ?? (d.from as string | undefined), removed) });
    case "news.delete":
      return t("audit.newsDelete", v);
    case "attendance.set":
      return t("audit.attendanceSet", { ...v, from: st(d.from), to: st(d.to) });
    case "waitlist.move_up":
      return t("audit.waitlistUp", v);
    case "waitlist.reorder":
      return t(d.dir === "up" ? "audit.reorderUp" : "audit.reorderDown", v);
    case "waitlist.auto":
      return t(d.on ? "audit.autoOn" : "audit.autoOff", v);
    case "attendance.remove":
      return t("audit.attendanceRemove", v);
    case "ticket.confirm":
      return t(d.paid ? "audit.ticketConfirm" : "audit.ticketUnconfirm", v);
    case "attendance.note":
      return t("audit.note", v);
    case "lanid.set":
      return t("audit.lanId", v);
    case "arrived.set":
      return t(d.arrived ? "audit.arrived" : "audit.notArrived", v);
    case "seatbooked.set":
      return t(d.booked ? "audit.booked" : "audit.notBooked", v);
    case "seat.assign":
      if (!d.to) return t("audit.seatTake", v);
      return t(d.from ? "audit.seatMove" : "audit.seatGive", v);
    case "seat.swap":
      return t(d.otherUserId ? "audit.seatSwap" : "audit.seatSwapMove", v);
    case "seat.auto":
      return t(d.mode === "replan" ? "audit.replan" : d.mode === "auto" ? "audit.autoReplan" : "audit.autoAssign", v);
    case "seat.autoPlan":
      return t(d.on ? "audit.autoPlanOn" : "audit.autoPlanOff", v);
    case "seat.wishes":
      return t("audit.wishesChanged", v);
    case "seat.nearRange":
      return t("audit.nearRange", v);
    case "seat.layout":
      return t(d.spec ? "audit.layoutTo" : "audit.layout", v);
    case "seat.lock":
      return t(d.locked ? "audit.lock" : "audit.unlock", v);
    case "seat.picking":
      return t(d.open ? "audit.pickOpen" : "audit.pickClose", v);
    case "seats.finalize":
      return t(d.notified ? "audit.finalizeTold" : "audit.finalize", v);
    case "seats.reopen":
      return t("audit.reopen", v);
    case "swap.decide":
      return t(d.approved ? "audit.swapApprove" : "audit.swapReject", v);
    case "clan.update":
      return t("audit.clanUpdate", { fields: list(d.fields) });
    case "clan.delete":
      return t("audit.clanDelete", v);
    case "clan.supporter": {
      const until = typeof d.until === "number" ? t("audit.until", { date: fmtDay(new Date(d.until)) }) : "";
      if (d.donation) return t("audit.supporterDonation", { until });
      return t(d.renewed ? "audit.supporterRenewed" : "audit.supporter", { until });
    }
    case "clan.supporter_end":
      return t("audit.supporterEnd");
    case "platform.donation": {
      const amount = typeof d.amount === "number" && typeof d.currency === "string" ? fmtMoney(d.amount, d.currency) : "";
      return t(e.clanId ? "audit.donationClan" : "audit.donation", { amount });
    }
    case "platform.donation_refund": {
      const amount = typeof d.amount === "number" && typeof d.currency === "string" ? fmtMoney(d.amount, d.currency) : "";
      return t("audit.donationRefund", { amount });
    }
    case "member.add":
      return t("audit.memberAdd", v);
    case "member.approve":
      return t("audit.memberApprove", v);
    case "member.role":
      // Older entries only knew admin/member.
      if (d.to === "admin") return t("audit.roleAdmin", v);
      if (d.to === "member") return t("audit.roleMember", { who, from: role(d.from ?? "admin") });
      return t("audit.role", { who, role: role(d.to) });
    case "member.remove":
      return t(d.pending ? "audit.memberDecline" : "audit.memberRemove", v);
    case "member.account_deleted":
      return t("audit.accountLeft");
    case "invite.create":
      return t("audit.inviteCreate");
    case "invite.delete":
      return t("audit.inviteDelete");
    case "guest.add":
      return t(d.existing ? "audit.guestAddExisting" : "audit.guestAdd", v);
    case "guest.update":
      return t("audit.guestUpdate", { who, fields: list(d.fields) });
    case "guest.email":
      return t("audit.guestEmail", v);
    case "guest.delete":
      return t("audit.guestDelete", { guest: String(d.guest ?? t("audit.nameNotKept")) });
    case "guest.renew_link":
      return t("audit.guestRenew", v);
    case "guest.claimed":
      return t(d.guest ? "audit.guestClaimedOf" : "audit.guestClaimed", { ...v, match: match && ` (${match})`, via });
    case "guest.claim_request":
      return t("audit.claimRequest", { ...v, match: match && ` (${match})`, via });
    case "guest.discord_link":
      return t(d.relinked ? "audit.discordRelink" : "audit.discordLink", v);
    case "guest.discord_dm":
      return t(d.ok ? "audit.discordDm" : "audit.discordDmRefused", v);
    case "guest.discord_unlink":
      return t("audit.discordUnlink", v);
    case "guest.claim_approve":
      return t("audit.claimApprove", v);
    case "guest.claim_decline":
      return t("audit.claimDecline", v);
    case "guest.merged":
      return t("audit.merged", { ...v, guest: String(d.guest ?? ""), via });
    case "type.save":
      return t(d.created ? "audit.typeCreate" : "audit.typeEdit", v);
    case "type.delete":
      return t("audit.typeDelete", v);
    case "discord.unlink":
      return t("audit.discordChannelUnlink", v);
    case "platform.role":
      // Older entries (before platform roles) only knew admin/member.
      if (!d.from) return t(d.to === "admin" ? "audit.platformAdmin" : "audit.platformAdminRemove", v);
      return t("audit.platformRole", { who, role: isStaffRole(d.to) ? t(`platformRoles.name.${d.to}`) : t("platformRoles.name.member") });
    case "user.suspend":
      return t("audit.userSuspend", v);
    case "user.unsuspend":
      return t("audit.userUnsuspend", v);
    case "clan.suspend":
      return t("audit.clanSuspend");
    case "clan.unsuspend":
      return t("audit.clanUnsuspend");
    case "report.file":
      return t(d.kind === "event" ? "audit.reportEvent" : "audit.reportClan");
    case "report.resolved":
      return t("audit.reportResolved");
    case "report.dismissed":
      return t("audit.reportDismissed");
    case "report.reopen":
      return t("audit.reportReopen");
    case "settings.save":
      return t("audit.settings", { keys: list(d.keys) });
    case "settings.maintenance":
      return t("audit.maintenance", v);
    case "settings.maintenance_clear":
      return t("audit.maintenanceClear");
    case "settings.announce":
      return t("audit.announce", v);
    case "mail_template.save":
      return t("audit.templateSave", v);
    case "mail_template.reset":
      return t("audit.templateReset", v);
    case "account.delete":
      return t("audit.accountDelete");
    case "payment.settings":
      return t(d.on ? (d.info ? "audit.paymentsOnInfo" : "audit.paymentsOn") : "audit.paymentsOff");
    case "payment.charge_create":
      return t("audit.chargeCreate", v);
    case "payment.charge_update":
      return t("audit.chargeUpdate", v);
    case "payment.charge_delete":
      return t("audit.chargeDelete", v);
    case "payment.add":
      return t("audit.chargeAdd", v);
    case "payment.remove":
      return t("audit.chargeRemove", v);
    case "payment.amount":
      return t("audit.chargeAmount", v);
    case "payment.remind":
      return t("audit.chargeRemind", v);
    case "payment.stripe_connect":
      return t("audit.stripeConnect");
    case "payment.stripe_ready":
      return t("audit.stripeReady");
    case "payment.stripe_disconnect":
      return t("audit.stripeDisconnect");
    case "payment.refund":
      return t("audit.chargeRefund", v);
    case "payment.report":
      return t("audit.chargeReport", v);
    case "payment.mark":
      if (d.status === "paid") {
        const how = typeof d.via === "string" && ["cash", "bank", "twint", "stripe"].includes(d.via) ? t(`audit.via.${d.via as "cash"}`) : "";
        return t("audit.chargePaid", { ...v, how });
      }
      return t(d.status === "waived" ? "audit.chargeWaived" : "audit.chargeReopen", v);
    case "emergency.view":
      return t("audit.emergencyView", v);
    case "backup.create":
      return t("audit.backupCreate", v);
    case "backup.download":
      return t("audit.backupDownload", v);
    case "backup.delete":
      return t("audit.backupDelete", v);
    default:
      return e.action;
  }
}
