import "server-only";
import { and, count, desc, eq, gt, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ReportReason, ReportStatus } from "@/db/schema";
import { audit } from "./audit";

const { report, user, clan, lan, session } = schema;

/** Open reports one person may file per day, so the queue can't be flooded. */
const DAILY_LIMIT = 5;

export type FileReportResult = { ok: true; id: string } | { ok: false; reason: "limit" | "duplicate" | "notFound" };

/**
 * Files a report about a clan or an event. The reporter isn't written to the clan's audit log,
 * so the clan's admins never see who reported them.
 */
export function fileReport(input: {
  reporterId: string;
  clanId?: string | null;
  lanId?: string | null;
  reason: ReportReason;
  message: string;
}): FileReportResult {
  const l = input.lanId ? db.select().from(lan).where(eq(lan.id, input.lanId)).get() : undefined;
  const clanId = l ? l.clanId : (input.clanId ?? null);
  const c = clanId ? db.select().from(clan).where(eq(clan.id, clanId)).get() : undefined;
  if (input.lanId ? !l : !c) return { ok: false, reason: "notFound" };

  const mine = db
    .select({ n: count() })
    .from(report)
    .where(and(eq(report.reporterId, input.reporterId), gt(report.createdAt, new Date(Date.now() - 86400_000))))
    .get()!.n;
  if (mine >= DAILY_LIMIT) return { ok: false, reason: "limit" };
  // One open report per person and clan or event is enough.
  const dup = db
    .select({ id: report.id })
    .from(report)
    .where(
      and(
        eq(report.reporterId, input.reporterId),
        eq(report.status, "open"),
        l ? eq(report.lanId, l.id) : and(eq(report.clanId, clanId!), isNull(report.lanId)),
      ),
    )
    .get();
  if (dup) return { ok: false, reason: "duplicate" };

  const row = db
    .insert(report)
    .values({
      clanId,
      lanId: l?.id ?? null,
      subject: l ? l.name : (c?.name ?? ""),
      reporterId: input.reporterId,
      reason: input.reason,
      message: input.message.trim().slice(0, 2000),
    })
    .returning({ id: report.id })
    .get();
  audit({ actorId: input.reporterId, action: "report.file", data: { report: row.id, reason: input.reason, kind: l ? "event" : "clan" } });
  return { ok: true, id: row.id };
}

export function openReportCount() {
  return db.select({ n: count() }).from(report).where(eq(report.status, "open")).get()!.n;
}

export function listReports(status: ReportStatus | "closed") {
  const where = status === "closed" ? inArray(report.status, ["resolved", "dismissed"]) : eq(report.status, status);
  return db.select().from(report).where(where).orderBy(desc(report.createdAt)).limit(200).all();
}

export function getReport(id: string) {
  return db.select().from(report).where(eq(report.id, id)).get();
}

export function closeReport(id: string, actorId: string, status: ReportStatus, note: string) {
  const r = getReport(id);
  if (!r) return false;
  db.update(report)
    .set({ status, note: note.trim().slice(0, 2000), handledBy: status === "open" ? null : actorId, handledAt: status === "open" ? null : new Date() })
    .where(eq(report.id, id))
    .run();
  audit({ actorId, action: `report.${status === "open" ? "reopen" : status}`, data: { report: id, kind: r.lanId ? "event" : "clan" } });
  return true;
}

/** Suspends a login: signed out everywhere, can't sign back in until restored. */
export function suspendUser(userId: string, actorId: string, reason: string) {
  db.update(user).set({ suspendedAt: new Date(), suspendedReason: reason.trim().slice(0, 500) || null }).where(eq(user.id, userId)).run();
  db.delete(session).where(eq(session.userId, userId)).run();
  audit({ actorId, action: "user.suspend", targetUserId: userId });
}

export function unsuspendUser(userId: string, actorId: string) {
  db.update(user).set({ suspendedAt: null, suspendedReason: null }).where(eq(user.id, userId)).run();
  audit({ actorId, action: "user.unsuspend", targetUserId: userId });
}

/** Suspends a clan: members lose access to it and its events, the bot and reminders go quiet. */
export function suspendClan(clanId: string, actorId: string, reason: string) {
  db.update(clan).set({ suspendedAt: new Date(), suspendedReason: reason.trim().slice(0, 500) || null }).where(eq(clan.id, clanId)).run();
  audit({ actorId, action: "clan.suspend", clanId });
}

export function unsuspendClan(clanId: string, actorId: string) {
  db.update(clan).set({ suspendedAt: null, suspendedReason: null }).where(eq(clan.id, clanId)).run();
  audit({ actorId, action: "clan.unsuspend", clanId });
}
