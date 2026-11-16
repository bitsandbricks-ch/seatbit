import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { attendanceLocked, setAttendance } from "./lans";
import { lanChanged } from "./live";

const { attendance, lan } = schema;

/**
 * Someone left a clan or was removed from it: they can't open its events any more, so their answers
 * on its upcoming events go, like a "not coming" (the seat frees up and the waitlist moves up, and
 * they get no more reminders). Answers with a ticket or a payment stay: money is involved, so the
 * leads sort those out. Returns how many stayed.
 */
export async function withdrawFromClanEvents(clanId: string, userId: string) {
  const rows = db
    .select({ a: attendance, l: lan })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .where(and(eq(attendance.userId, userId), eq(lan.clanId, clanId), gt(lan.endsAt, new Date())))
    .all();
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
