import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { EmergencyInfo, Lan } from "@/db/schema";
import { auditLan } from "./audit";
import { roleCan } from "./clan-roles";
import { clanRole, isClanSuspended } from "./clans";

const { emergencyInfo, attendance, lanOrga, auditLog } = schema;

export const EMERGENCY_MAX = { name: 80, phone: 40, diet: 300 } as const;

/** Leads keep access for a couple of days after the event (trip home, lost and found), then it's gone. */
const AFTER_EVENT_MS = 2 * 86400_000;

/** One look per lead and event and hour is enough for the log. */
const VIEW_LOG_GAP_MS = 3600_000;

export type EmergencyFields = Pick<EmergencyInfo, "contactName" | "contactPhone" | "diet">;

export function getEmergencyInfo(userId: string): EmergencyFields {
  const row = db.select().from(emergencyInfo).where(eq(emergencyInfo.userId, userId)).get();
  return { contactName: row?.contactName ?? "", contactPhone: row?.contactPhone ?? "", diet: row?.diet ?? "" };
}

/** Saves the member's own info; all fields empty removes the row. */
export function saveEmergencyInfo(userId: string, f: EmergencyFields) {
  const v = {
    contactName: f.contactName.trim().slice(0, EMERGENCY_MAX.name),
    contactPhone: f.contactPhone.trim().slice(0, EMERGENCY_MAX.phone),
    diet: f.diet.trim().slice(0, EMERGENCY_MAX.diet),
  };
  if (!v.contactName && !v.contactPhone && !v.diet) {
    db.delete(emergencyInfo).where(eq(emergencyInfo.userId, userId)).run();
    return;
  }
  db.insert(emergencyInfo)
    .values({ userId, ...v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: emergencyInfo.userId, set: { ...v, updatedAt: new Date() } })
    .run();
}

/**
 * Who may see the emergency info of an event's attendees: its leads and the clan's event
 * managers. Unlike isLanManager, platform staff don't get it just for being staff: it's health
 * data and they don't need it to run the instance.
 */
export function canSeeEmergency(u: { id: string }, l: Pick<Lan, "id" | "clanId" | "endsAt">, now = new Date()) {
  if (+l.endsAt + AFTER_EVENT_MS < +now) return false;
  if (l.clanId && isClanSuspended(l.clanId)) return false;
  if (l.clanId && roleCan(clanRole(u.id, l.clanId), "events")) return true;
  return !!db
    .select({ id: lanOrga.userId })
    .from(lanOrga)
    .where(and(eq(lanOrga.lanId, l.id), eq(lanOrga.userId, u.id)))
    .get();
}

/** Emergency info of everyone coming (not the waitlist), keyed by user id; people who left it empty are missing. */
export function emergencyForLan(lanId: string): Map<string, EmergencyFields> {
  const going = db
    .select({ userId: attendance.userId })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going")))
    .all()
    .map((r) => r.userId);
  if (!going.length) return new Map();
  const rows = db.select().from(emergencyInfo).where(inArray(emergencyInfo.userId, going)).all();
  return new Map(rows.map((r) => [r.userId, { contactName: r.contactName, contactPhone: r.contactPhone, diet: r.diet }]));
}

/** How many people coming noted dietary needs (a hint for food orders, no details). */
export function dietCount(lanId: string) {
  return [...emergencyForLan(lanId).values()].filter((e) => e.diet).length;
}

/** Logs that a lead opened the emergency info, at most once an hour per lead and event. */
export function logEmergencyView(l: Pick<Lan, "id" | "clanId" | "name">, actorId: string, count: number) {
  const recent = db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "emergency.view"),
        eq(auditLog.lanId, l.id),
        eq(auditLog.actorId, actorId),
        gt(auditLog.at, new Date(Date.now() - VIEW_LOG_GAP_MS)),
      ),
    )
    .get();
  if (!recent) auditLan(l, actorId, "emergency.view", { data: { count } });
}
