import { and, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { attendanceLocked, setAttendance } from "./lans";
import { lanChanged } from "./live";

const { attendance, lan, lanOrga, seat, clanMember, user } = schema;

/**
 * Takes a person's name out of everyone's seat wishes ("next to", "near", "not next to"), on the given
 * events or everywhere. Without this the wish stays behind pointing at nobody and shows as "?".
 */
export function dropWishesAbout(userId: string, lanIds?: string[]) {
  if (lanIds && !lanIds.length) return;
  const onLans = lanIds ? sql` AND lan_id IN (${sql.join(lanIds.map((l) => sql`${l}`), sql`, `)})` : sql``;
  db.run(
    sql`UPDATE attendance SET wish_rules = (SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(wish_rules) WHERE json_extract(value, '$.userId') IS NOT ${userId} ORDER BY key)) WHERE wish_rules LIKE ${`%"${userId}"%`}${onLans}`,
  );
}

/**
 * Someone left a clan or was removed from it: they can't open its events any more, so their answers
 * on its upcoming events go, like a "not coming" (the seat frees up and the waitlist moves up), with
 * what hangs on them there: others' seat wishes about them, seat swaps, rides, sleeping spots and
 * teams. Answers with a ticket or a payment stay: money is involved and they may still go, so the
 * leads sort those out (Manage marks them as no longer in the clan). Their lead roles on the clan's
 * events go too. Past events stay as they were. Returns how many answers stayed.
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
  const left: string[] = [];
  for (const { a, l } of rows) {
    if (attendanceLocked(a)) {
      kept++;
      continue;
    }
    if (a.status === "going") await setAttendance(l, userId, "declined", { force: true });
    db.delete(attendance).where(eq(attendance.id, a.id)).run();
    left.push(l.id);
  }
  // Upcoming events where they hold no ticket: also the ones they never answered, so a wish or a
  // ride from before an answer was withdrawn doesn't linger.
  const upcoming = db
    .select({ id: lan.id })
    .from(lan)
    .where(and(eq(lan.clanId, clanId), gt(lan.endsAt, new Date())))
    .all()
    .map((l) => l.id)
    .filter((id) => !rows.some(({ a, l }) => l.id === id && attendanceLocked(a)));
  if (upcoming.length) {
    clearFromEvents(userId, upcoming);
    for (const id of new Set([...left, ...upcoming])) lanChanged(id);
  }
  return kept;
}

/** Everything on these events that still names the person, besides their answer. */
function clearFromEvents(userId: string, lanIds: string[]) {
  db.update(seat).set({ userId: null }).where(and(eq(seat.userId, userId), inArray(seat.lanId, lanIds))).run();
  dropWishesAbout(userId, lanIds);
  db.delete(schema.seatSwap)
    .where(
      and(
        inArray(schema.seatSwap.lanId, lanIds),
        or(eq(schema.seatSwap.fromUserId, userId), eq(schema.seatSwap.toUserId, userId)),
      ),
    )
    .run();
  // Their own ride and sleeping offers go (with whoever joined them); spots they took in others' too.
  db.delete(schema.travelPost).where(and(eq(schema.travelPost.userId, userId), inArray(schema.travelPost.lanId, lanIds))).run();
  const posts = db.select({ id: schema.travelPost.id }).from(schema.travelPost).where(inArray(schema.travelPost.lanId, lanIds)).all();
  if (posts.length)
    db.delete(schema.travelSpot)
      .where(and(eq(schema.travelSpot.userId, userId), inArray(schema.travelSpot.postId, posts.map((p) => p.id))))
      .run();
  const games = db.select({ id: schema.game.id }).from(schema.game).where(inArray(schema.game.lanId, lanIds)).all();
  const teams = games.length
    ? db.select({ id: schema.team.id }).from(schema.team).where(inArray(schema.team.gameId, games.map((g) => g.id))).all()
    : [];
  if (teams.length)
    db.delete(schema.teamMember)
      .where(and(eq(schema.teamMember.userId, userId), inArray(schema.teamMember.teamId, teams.map((t) => t.id))))
      .run();
}

/**
 * Cleans up after people who left a clan before leaving withdrew anything (older data): every
 * upcoming answer of someone who is no longer in the event's clan goes the same way as above.
 * Platform staff are left alone: they may take part in events they manage without being members.
 * Safe to run again; it runs at every start.
 */
export async function withdrawFormerMembers() {
  const now = new Date();
  const rows = db
    .select({ clanId: lan.clanId, userId: attendance.userId, role: user.role })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .innerJoin(user, eq(user.id, attendance.userId))
    .leftJoin(clanMember, and(eq(clanMember.clanId, lan.clanId), eq(clanMember.userId, attendance.userId)))
    .where(and(isNotNull(lan.clanId), gt(lan.endsAt, now), or(sql`${clanMember.userId} IS NULL`, eq(clanMember.role, "pending"))))
    .all();
  const pairs = new Map<string, { clanId: string; userId: string }>();
  for (const r of rows) {
    if (r.role !== "member") continue;
    pairs.set(`${r.clanId}\t${r.userId}`, { clanId: r.clanId!, userId: r.userId });
  }
  for (const p of pairs.values()) await withdrawFromClanEvents(p.clanId, p.userId);
  return pairs.size;
}

/** People with an answer on this event who are no longer in its clan (kept for a ticket or payment). */
export function formerMembersOf(lanId: string): Set<string> {
  const rows = db
    .select({ userId: attendance.userId })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .leftJoin(clanMember, and(eq(clanMember.clanId, lan.clanId), eq(clanMember.userId, attendance.userId)))
    .where(and(eq(attendance.lanId, lanId), isNotNull(lan.clanId), or(sql`${clanMember.userId} IS NULL`, eq(clanMember.role, "pending"))))
    .all();
  return new Set(rows.map((r) => r.userId));
}
