import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { guestAnswerWins } from "./answer-strength";
import { getDefaultNames } from "./lans";

/** A real account a guest can be linked to, with the events both answered and whose answer stays. */
export type LinkCandidate = {
  id: string;
  name: string;
  email: string;
  conflicts: { event: string; keep: "guest" | "member" }[];
};

/**
 * Who a guest can be linked to: the clan's real members, or (for platform staff) every account.
 * For each, the events where both answered, so the confirm dialog can say what stays.
 */
export function guestLinkCandidates(g: User, anyAccount: boolean): LinkCandidate[] {
  const u = schema.user;
  const real = and(eq(u.isGuest, false), isNull(u.deletedAt));
  const people =
    anyAccount || !g.guestClanId
      ? db.select({ id: u.id, email: u.email }).from(u).where(real).all()
      : db
          .select({ id: u.id, email: u.email })
          .from(schema.clanMember)
          .innerJoin(u, eq(u.id, schema.clanMember.userId))
          .where(and(eq(schema.clanMember.clanId, g.guestClanId), ne(schema.clanMember.role, "pending"), real))
          .all();
  const names = getDefaultNames(people.map((p) => p.id));

  const theirs = db
    .select({ a: schema.attendance, event: schema.lan.name })
    .from(schema.attendance)
    .innerJoin(schema.lan, eq(schema.lan.id, schema.attendance.lanId))
    .where(eq(schema.attendance.userId, g.id))
    .all();
  const both = theirs.length
    ? db
        .select()
        .from(schema.attendance)
        .where(inArray(schema.attendance.lanId, theirs.map((r) => r.a.lanId)))
        .all()
    : [];

  return people
    .map((p) => ({
      id: p.id,
      name: names.get(p.id)?.full ?? p.email,
      email: p.email,
      conflicts: theirs.flatMap(({ a, event }) => {
        const mine = both.find((x) => x.lanId === a.lanId && x.userId === p.id);
        return mine ? [{ event, keep: guestAnswerWins(a, mine) ? ("guest" as const) : ("member" as const) }] : [];
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
