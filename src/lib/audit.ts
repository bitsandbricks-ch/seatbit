import "server-only";
import { and, count, desc, eq, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AuditEntry } from "@/db/schema";
import { getDefaultNames } from "./lans";
import { roleWithArticle } from "./clan-roles";

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
  events: { label: "Events", prefixes: ["event.", "orga.", "news."] },
  attendance: { label: "Answers & tickets", prefixes: ["attendance.", "ticket.", "lanid.", "arrived.", "seatbooked."] },
  seats: { label: "Seats", prefixes: ["seat.", "seats.", "swap."] },
  members: { label: "Members & roles", prefixes: ["member.", "invite.", "clan.", "platform.", "account."] },
  guests: { label: "Guests", prefixes: ["guest."] },
  settings: { label: "Settings", prefixes: ["type.", "discord.", "settings.", "mail_template."] },
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

export function auditCount(clanId: string) {
  return db.select({ n: count() }).from(auditLog).where(eq(auditLog.clanId, clanId)).get()?.n ?? 0;
}

/** Names for the people in a page of entries. Removed guests (row gone) show as "a removed guest". */
export function auditNames(rows: AuditEntry[]) {
  const ids = rows.flatMap((r) => [r.actorId, r.targetUserId, typeof r.data.otherUserId === "string" ? r.data.otherUserId : null]);
  const names = getDefaultNames(ids.filter((x): x is string => !!x));
  return (id: string | null | undefined, fallback = "someone") => (id ? names.get(id)?.full ?? fallback : fallback);
}

const STATUS: Record<string, string> = { going: "coming", maybe: "unsure", declined: "not coming", waitlist: "waitlist" };
const st = (v: unknown) => (typeof v === "string" ? STATUS[v] ?? v : "no answer");
const list = (v: unknown) => (Array.isArray(v) && v.length ? v.join(", ") : "details");

/**
 * What happened, as a sentence without the actor ("moved Anna "Pixel" Muster from F3 to F7").
 * `name` resolves user ids; the event is named by the caller where it's shown.
 */
export function describeAudit(e: AuditEntry, name: (id: string | null | undefined, fallback?: string) => string): string {
  const d = e.data as Record<string, unknown>;
  const who = name(e.targetUserId, "a removed person");
  const other = name(d.otherUserId as string | undefined, "a removed person");
  const at = d.event ? ` at ${d.event}` : "";
  switch (e.action) {
    case "event.create":
      return `created the event ${d.event} (draft)`;
    case "event.update":
      return `changed ${list(d.fields)} of ${d.event}`;
    case "event.publish":
      return d.scheduled ? `${d.event} went live (scheduled publish)` : `published ${d.event}`;
    case "event.schedule":
      return d.at ? `scheduled ${d.event} to go live on ${d.at}` : `removed the scheduled publish of ${d.event}`;
    case "event.signup_open":
      return `ended the interest check and opened sign-up for ${d.event}`;
    case "event.cancel":
      return `cancelled ${d.event}${d.reason ? ` ("${d.reason}")` : ""}`;
    case "event.uncancel":
      return `took back the cancellation of ${d.event}`;
    case "event.delete":
      return `deleted the event ${d.event}`;
    case "event.copy":
      return `copied ${d.from} as next year's draft ${d.event}`;
    case "orga.add":
      return `made ${who} an orga${at}`;
    case "orga.remove":
      return `removed ${who} as orga${at}`;
    case "news.delete":
      return `deleted an orga news post${at}`;
    case "attendance.set":
      return `changed the answer of ${who}${at} from ${st(d.from)} to ${st(d.to)}`;
    case "attendance.remove":
      return `removed ${who} from the attendees${at}`;
    case "ticket.confirm":
      return d.paid ? `confirmed the ticket of ${who}${at}` : `took back the ticket confirmation of ${who}${at}`;
    case "attendance.note":
      return `edited the orga note on ${who}${at}`;
    case "lanid.set":
      return `set the LAN ID of ${who}${at}`;
    case "arrived.set":
      return d.arrived ? `checked in ${who}${at}` : `undid the check-in of ${who}${at}`;
    case "seatbooked.set":
      return d.booked ? `marked the seat of ${who} as booked on the event site${at}` : `cleared the "seat booked" tick of ${who}${at}`;
    case "seat.assign":
      if (!d.to) return `took seat ${d.from} away from ${who}${at}`;
      return d.from ? `moved ${who} from ${d.from} to ${d.to}${at}` : `gave ${who} seat ${d.to}${at}`;
    case "seat.swap":
      return d.otherUserId ? `swapped ${who} (${d.a}) and ${other} (${d.b})${at}` : `moved ${who} from ${d.a} to ${d.b}${at}`;
    case "seat.auto":
      return d.mode === "replan" ? `re-planned all seats${at} (${d.count} seated)` : `auto-assigned ${d.count} seats${at}`;
    case "seat.layout":
      return `changed the seat block${at}${d.spec ? ` to ${d.spec}` : ""}`;
    case "seat.lock":
      return d.locked ? `held seat ${d.seat}${at}` : `released the hold on seat ${d.seat}${at}`;
    case "seat.picking":
      return d.open ? `opened seat self pick${at}` : `closed seat self pick${at}`;
    case "seats.finalize":
      return `finalized the seat plan${at}${d.notified ? `, told ${d.notified} people` : ""}`;
    case "seats.reopen":
      return `reopened the seat plan${at}`;
    case "swap.decide":
      return `${d.approved ? "approved" : "rejected"} the seat swap of ${who} and ${other}${at}`;
    case "clan.update":
      return `changed the clan's ${list(d.fields)}`;
    case "clan.delete":
      return `deleted the clan ${d.clan}`;
    case "member.add":
      return `added ${who} to the clan`;
    case "member.approve":
      return `approved the join request of ${who}`;
    case "member.role":
      // Older entries only knew admin/member.
      if (d.to === "admin") return `made ${who} a clan admin`;
      if (d.to === "member") return `made ${who} a plain member (was ${roleWithArticle(String(d.from ?? "admin"))})`;
      return `made ${who} ${roleWithArticle(String(d.to))}`;
    case "member.remove":
      return d.pending ? `declined the join request of ${who}` : `removed ${who} from the clan`;
    case "member.account_deleted":
      return `deleted their account and left the clan`;
    case "invite.create":
      return `created an invite link`;
    case "invite.delete":
      return `deleted an invite link`;
    case "guest.add":
      return d.existing ? `added ${who} (already on Seatbit) instead of a guest` : `added the guest ${who}`;
    case "guest.update":
      return `edited the guest ${who} (${list(d.fields)})`;
    case "guest.email":
      return `set the email of the guest ${who} and sent the invite`;
    case "guest.delete":
      return `removed the guest ${d.guest ?? "(name not kept)"}`;
    case "guest.renew_link":
      return `made a new claim link for the guest ${who}`;
    case "guest.claimed":
      return `took over the guest profile${d.guest ? ` of ${d.guest}` : ""}${d.match ? ` (same ${d.match})` : ""}`;
    case "guest.claim_request":
      return `asked to take over the guest ${d.guest}${d.match ? ` (same ${d.match})` : ""}`;
    case "guest.claim_approve":
      return `confirmed ${who} is the guest ${d.guest}`;
    case "guest.claim_decline":
      return `declined ${who}'s request to take over the guest ${d.guest}`;
    case "guest.merged":
      return `moved the guest ${d.guest ?? ""} over to ${who}'s account`;
    case "type.save":
      return d.created ? `created the LAN type ${d.type}` : `edited the LAN type ${d.type}`;
    case "type.delete":
      return `deleted the LAN type ${d.type}`;
    case "discord.unlink":
      return `unlinked the Discord channel #${d.channel}`;
    case "platform.role":
      return d.to === "admin" ? `made ${who} a platform admin` : `removed ${who} as platform admin`;
    case "settings.save":
      return `changed platform settings (${list(d.keys)})`;
    case "mail_template.save":
      return `edited the mail template "${d.template}"`;
    case "mail_template.reset":
      return `reset the mail template "${d.template}" to the default`;
    case "account.delete":
      return `deleted their account`;
    default:
      return e.action;
  }
}
