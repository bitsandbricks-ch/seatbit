import { and, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { attendanceLocked, setAttendance } from "./lans";
import { lanChanged } from "./live";

const { attendance, lan, lanOrga } = schema;

/**
 * Someone left a clan or was removed from it: they can't open its events any more, so their answers
 * on its upcoming events go, like a "not coming" (the seat frees up and the waitlist moves up, and
 * they get no more reminders). Answers with a ticket or a payment stay: money is involved, so the
 * leads sort those out. Their lead roles on the clan's events go too. Returns how many answers stayed.
 */
export async function withdrawFromClanEvents(clanId: string, userId: string) {
  const rows = db
    .select({ a: attendance, l: lan })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .where(and(eq(attendance.userId, userId), eq(lan.clanId, clanId), gt(lan.endsAt, new Date())))
    .all();
  const clanLans = db.select({ id: lan.id }).from(lan).where(eq(lan.clanId, clanId)).all().map((l) => l.id);
  if (clanLans.length) db.delete(lanOrga).where(and(eq(lanOrga.userId, userId), inArray(lanOrga.lanId, clanLans))).run();
  let kept = 0;
  for (const { a, l } of rows) {
    if (attendanceLocked(a)) {
      kept++;
      continue;
    }
    if (a.status === "going") await setAttendance(l, userId, "declined", { force: true });
    db.delete(attendance).where(eq(attendance.id, a.id)).run();
    lanChanged(l.id);
  }
  return kept;
}
