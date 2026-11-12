import "server-only";
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Clan } from "@/db/schema";
import { audit, auditNames, describeAudit } from "./audit";
import { deleteUserAvatarFile } from "./avatars";
import { cancelSupport } from "./billing";
import { GUEST_EMAIL_DOMAIN } from "./guests";
import { getDefaultNames, setAttendance } from "./lans";
import { appUrl } from "./mail";

const { user, clan, clanMember, attendance, seat, lan } = schema;

/** What a deleted account is shown as everywhere (past events, the audit log). */
export const DELETED_NAME = { firstName: "Deleted", lastName: "member", name: "Deleted member" };

export const deletedEmail = (id: string) => `deleted-${id}@${GUEST_EMAIL_DOMAIN}`;

export type DeletionCheck = {
  /** Clans where the person is the only admin and others with a login are left: they must hand over first. */
  blockingClans: Clan[];
  /** Clans where nobody else with a login is left: they go with the account (events, guests and all). */
  clansToDelete: Clan[];
  /** The only platform admin while others use this instance. */
  lastPlatformAdmin: boolean;
  /** Upcoming events the person has answered for: their answer and seat are removed. */
  upcomingEvents: number;
};

/** What deleting this account would do, and what stops it. */
export function checkDeletion(userId: string): DeletionCheck {
  const me = db.select().from(user).where(eq(user.id, userId)).get();
  const mine = db
    .select({ clan, role: clanMember.role })
    .from(clanMember)
    .innerJoin(clan, eq(clan.id, clanMember.clanId))
    .where(eq(clanMember.userId, userId))
    .all();
  const blockingClans: Clan[] = [];
  const clansToDelete: Clan[] = [];
  for (const { clan: c, role } of mine) {
    if (role !== "admin") continue;
    const others = db
      .select({ role: clanMember.role, isGuest: user.isGuest })
      .from(clanMember)
      .innerJoin(user, eq(user.id, clanMember.userId))
      .where(and(eq(clanMember.clanId, c.id), ne(clanMember.userId, userId)))
      .all();
    if (others.some((o) => o.role === "admin")) continue;
    // Guests can't log in and pending people aren't in yet, so they can't take over.
    if (others.some((o) => !o.isGuest && o.role !== "pending")) blockingClans.push(c);
    else clansToDelete.push(c);
  }
  let lastPlatformAdmin = false;
  if (me?.role === "admin") {
    const otherAdmins = db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "admin"), ne(user.id, userId), isNull(user.deletedAt)))
      .all().length;
    const otherUsers = db
      .select({ id: user.id })
      .from(user)
      .where(and(ne(user.id, userId), eq(user.isGuest, false), isNull(user.deletedAt)))
      .all().length;
    lastPlatformAdmin = otherAdmins === 0 && otherUsers > 0;
  }
  const upcomingEvents = db
    .select({ id: attendance.id })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .where(and(eq(attendance.userId, userId), gt(lan.endsAt, new Date())))
    .all().length;
  return { blockingClans, clansToDelete, lastPlatformAdmin, upcomingEvents };
}

/**
 * Deletes an account. Everything personal goes: profile, picture, email, Discord link and sessions,
 * nicks, LAN IDs, clan memberships, orga roles, answers and seats for upcoming events, rides,
 * packing lists, votes and swap requests. What stays is an empty "Deleted member" row with the
 * answers to past events (coming or not, ticket), so the clan's history and stats still add up.
 * Clans where nobody else with a login is left are deleted with it.
 */
export async function deleteAccount(userId: string) {
  const check = checkDeletion(userId);
  if (check.blockingClans.length) throw new Error("Make someone else admin of your clans first.");
  if (check.lastPlatformAdmin) throw new Error("Make someone else platform admin first.");
  const me = db.select().from(user).where(eq(user.id, userId)).get();
  if (!me || me.deletedAt) throw new Error("Account not found");
  const now = new Date();

  // Upcoming events first, through the normal path: frees the seat, moves up the waitlist and
  // refreshes the Discord post.
  const upcoming = db
    .select({ a: attendance, l: lan })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .where(and(eq(attendance.userId, userId), gt(lan.endsAt, now)))
    .all();
  for (const { a, l } of upcoming) if (a.status === "going") await setAttendance(l, userId, "declined", { force: true });

  const keptClans = db
    .select({ clanId: clanMember.clanId })
    .from(clanMember)
    .where(and(eq(clanMember.userId, userId), ne(clanMember.role, "pending")))
    .all()
    .map((m) => m.clanId)
    .filter((id) => !check.clansToDelete.some((c) => c.id === id));

  // Clans that go away with the account stop their Supporter subscription too.
  for (const c of check.clansToDelete) await cancelSupport(c);

  db.transaction((tx) => {
    if (check.clansToDelete.length)
      tx.delete(clan).where(inArray(clan.id, check.clansToDelete.map((c) => c.id))).run();
    if (upcoming.length)
      tx.delete(attendance).where(inArray(attendance.id, upcoming.map((u) => u.a.id))).run();
    // Past events keep the answer, but not the personal bits.
    tx.update(attendance)
      .set({ note: "", wishNear: [], wishAvoid: [], wishPosition: "any", wishSeat: "", wishNote: "" })
      .where(eq(attendance.userId, userId))
      .run();
    tx.update(seat).set({ userId: null }).where(eq(seat.userId, userId)).run();
    // Others' seat wishes that name this person.
    for (const col of ["wish_near", "wish_avoid"] as const)
      tx.run(
        sql`UPDATE attendance SET ${sql.raw(col)} = (SELECT json_group_array(value) FROM json_each(${sql.raw(col)}) WHERE value != ${userId}) WHERE ${sql.raw(col)} LIKE ${`%"${userId}"%`}`,
      );
    tx.delete(schema.session).where(eq(schema.session.userId, userId)).run();
    tx.delete(schema.account).where(eq(schema.account.userId, userId)).run();
    tx.delete(schema.verification).where(eq(schema.verification.identifier, me.email)).run();
    tx.delete(schema.nickname).where(eq(schema.nickname.userId, userId)).run();
    tx.delete(schema.lanAccount).where(eq(schema.lanAccount.userId, userId)).run();
    tx.delete(clanMember).where(eq(clanMember.userId, userId)).run();
    tx.delete(schema.lanOrga).where(eq(schema.lanOrga.userId, userId)).run();
    tx.delete(schema.lanInterest).where(eq(schema.lanInterest.userId, userId)).run();
    tx.delete(schema.seatSwap).where(or(eq(schema.seatSwap.fromUserId, userId), eq(schema.seatSwap.toUserId, userId))).run();
    tx.delete(schema.gameVote).where(eq(schema.gameVote.userId, userId)).run();
    tx.delete(schema.travelSpot).where(eq(schema.travelSpot.userId, userId)).run();
    tx.delete(schema.travelPost).where(eq(schema.travelPost.userId, userId)).run();
    tx.delete(schema.gearPacked).where(eq(schema.gearPacked.userId, userId)).run();
    tx.delete(schema.packingItem).where(eq(schema.packingItem.userId, userId)).run();
    tx.delete(schema.reminderLog).where(eq(schema.reminderLog.userId, userId)).run();
    tx.update(schema.clanInvite).set({ createdBy: null }).where(eq(schema.clanInvite.createdBy, userId)).run();
    tx.update(schema.game).set({ addedBy: null }).where(eq(schema.game.addedBy, userId)).run();
    tx.update(schema.lanNews).set({ authorId: null }).where(eq(schema.lanNews.authorId, userId)).run();
    tx.update(schema.appSetting).set({ updatedBy: null }).where(eq(schema.appSetting.updatedBy, userId)).run();
    // Audit entries keep the person's id (shown as "Deleted member"), but not a guest name they had.
    tx.run(
      sql`UPDATE audit_log SET data = json_remove(data, '$.guest') WHERE (actor_id = ${userId} OR target_user_id = ${userId}) AND json_extract(data, '$.guest') IS NOT NULL`,
    );
    tx.update(user)
      .set({
        ...DELETED_NAME,
        email: deletedEmail(userId),
        emailVerified: false,
        image: null,
        role: "member",
        emailReminders: false,
        discordDms: false,
        isGuest: false,
        guestClanId: null,
        claimCode: null,
        inviteEmail: null,
        invitedAt: null,
        avatarStyle: "initials",
        avatarFile: null,
        icon: null,
        socials: {},
        color: null,
        deletedAt: now,
      })
      .where(eq(user.id, userId))
      .run();
  });
  deleteUserAvatarFile(me.avatarFile);

  audit({ actorId: userId, action: "account.delete", data: { clansDeleted: check.clansToDelete.length || undefined } });
  for (const clanId of keptClans) audit({ actorId: userId, action: "member.account_deleted", clanId });
}

// ---------- Data export ----------

/** Everything Seatbit stores about a person, as plain JSON (the "download my data" file). */
export function exportUserData(userId: string) {
  const me = db.select().from(user).where(eq(user.id, userId)).get();
  if (!me) return null;
  const nicks = db.select().from(schema.nickname).where(eq(schema.nickname.userId, userId)).all();
  const lanAccounts = db.select().from(schema.lanAccount).where(eq(schema.lanAccount.userId, userId)).all();
  const memberships = db
    .select({ m: clanMember, c: clan })
    .from(clanMember)
    .innerJoin(clan, eq(clan.id, clanMember.clanId))
    .where(eq(clanMember.userId, userId))
    .all();
  const atts = db
    .select({ a: attendance, l: lan })
    .from(attendance)
    .innerJoin(lan, eq(lan.id, attendance.lanId))
    .where(eq(attendance.userId, userId))
    .orderBy(desc(lan.startsAt))
    .all();
  const seats = db.select().from(seat).where(eq(seat.userId, userId)).all();
  const orgaOf = new Set(db.select().from(schema.lanOrga).where(eq(schema.lanOrga.userId, userId)).all().map((o) => o.lanId));
  const interests = db.select().from(schema.lanInterest).where(eq(schema.lanInterest.userId, userId)).all();
  const lans = new Map(db.select({ id: lan.id, name: lan.name, clanId: lan.clanId, typeId: lan.typeId }).from(lan).all().map((l) => [l.id, l]));
  const types = new Map(db.select({ id: schema.lanType.id, name: schema.lanType.name }).from(schema.lanType).all().map((t) => [t.id, t.name]));
  const clans = new Map(db.select({ id: clan.id, name: clan.name }).from(clan).all().map((c) => [c.id, c.name]));
  const posts = db.select().from(schema.travelPost).where(eq(schema.travelPost.userId, userId)).all();
  const spots = db.select().from(schema.travelSpot).where(eq(schema.travelSpot.userId, userId)).all();
  const spotPosts = spots.length
    ? db.select().from(schema.travelPost).where(inArray(schema.travelPost.id, spots.map((s) => s.postId))).all()
    : [];
  const packing = db.select().from(schema.packingItem).where(eq(schema.packingItem.userId, userId)).all();
  const packed = db.select().from(schema.gearPacked).where(eq(schema.gearPacked.userId, userId)).all();
  const games = db.select().from(schema.game).where(eq(schema.game.addedBy, userId)).all();
  const votes = db
    .select({ v: schema.gameVote, g: schema.game })
    .from(schema.gameVote)
    .innerJoin(schema.game, eq(schema.game.id, schema.gameVote.gameId))
    .where(eq(schema.gameVote.userId, userId))
    .all();
  const swaps = db
    .select()
    .from(schema.seatSwap)
    .where(or(eq(schema.seatSwap.fromUserId, userId), eq(schema.seatSwap.toUserId, userId)))
    .all();
  const news = db.select().from(schema.lanNews).where(eq(schema.lanNews.authorId, userId)).all();
  const accounts = db.select().from(schema.account).where(eq(schema.account.userId, userId)).all();
  const sessions = db.select().from(schema.session).where(eq(schema.session.userId, userId)).all();
  const logRows = db
    .select()
    .from(schema.auditLog)
    .where(or(eq(schema.auditLog.actorId, userId), eq(schema.auditLog.targetUserId, userId)))
    .orderBy(desc(schema.auditLog.at))
    .all();

  // Names of the other people that show up in the data (seat wishes, swaps, log).
  const otherIds = [
    ...atts.flatMap(({ a }) => [...(a.wishNear ?? []), ...(a.wishAvoid ?? [])]),
    ...swaps.flatMap((s) => [s.fromUserId, s.toUserId]),
  ];
  const names = getDefaultNames(otherIds);
  const nameOf = (id: string) => names.get(id)?.full ?? "Deleted member";
  const logName = auditNames(logRows);
  const event = (id: string) => lans.get(id)?.name ?? "(deleted event)";
  const scope = (r: { lanId: string | null; typeId: string | null }) =>
    r.lanId ? { event: event(r.lanId) } : r.typeId ? { lanType: types.get(r.typeId) ?? "(deleted LAN type)" } : "default";

  return {
    about: `Your data on Seatbit (${appUrl}), exported ${new Date().toISOString()}.`,
    profile: {
      id: me.id,
      firstName: me.firstName,
      lastName: me.lastName,
      name: me.name,
      email: me.email,
      emailVerified: me.emailVerified,
      platformRole: me.role,
      emailReminders: me.emailReminders,
      discordDms: me.discordDms,
      socials: me.socials,
      avatar: { style: me.avatarStyle, uploadedPicture: !!me.avatarFile, discordPicture: me.image, icon: me.icon, color: me.color },
      createdAt: me.createdAt,
      updatedAt: me.updatedAt,
    },
    signInMethods: accounts.map((a) => ({ provider: a.providerId, accountId: a.accountId, scope: a.scope, linkedAt: a.createdAt })),
    sessions: sessions.map((s) => ({ createdAt: s.createdAt, expiresAt: s.expiresAt, ipAddress: s.ipAddress, userAgent: s.userAgent })),
    nicknames: nicks.map((n) => ({ nick: n.nick, scope: scope(n), primary: n.isPrimary })),
    lanIds: lanAccounts.map((a) => ({ value: a.value, scope: scope(a) })),
    clans: memberships.map(({ m, c }) => ({
      clan: c.name,
      role: m.role,
      joinedAt: m.createdAt,
      hearAbout: m.interestTypes === null || m.interestTypes === undefined ? "all events" : m.interestTypes.map((t) => types.get(t) ?? t),
    })),
    events: atts.map(({ a, l }) => ({
      event: l.name,
      clan: l.clanId ? clans.get(l.clanId) : null,
      startsAt: l.startsAt,
      endsAt: l.endsAt,
      answer: a.status,
      ticketBought: a.ticketBought,
      ticketConfirmedByOrga: a.paid,
      orgaNote: a.note,
      seat: seats.find((s) => s.lanId === l.id)?.label ?? null,
      seatBookedOnEventSite: a.seatBooked,
      arrivedAt: a.arrivedAt,
      seatWishes: {
        sitNear: (a.wishNear ?? []).map(nameOf),
        notNextTo: (a.wishAvoid ?? []).map(nameOf),
        position: a.wishPosition,
        seat: a.wishSeat,
        note: a.wishNote,
      },
      orga: orgaOf.has(l.id),
      answeredAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
    orgaOf: [...orgaOf].map(event),
    interestCheckAnswers: interests.map((i) => ({ event: event(i.lanId), answer: i.answer, at: i.createdAt })),
    travel: {
      myPosts: posts.map((p) => ({ event: event(p.lanId), kind: p.kind, mode: p.mode, town: p.town, places: p.places, when: p.whenText, note: p.note, createdAt: p.createdAt })),
      joined: spots.map((s) => {
        const p = spotPosts.find((x) => x.id === s.postId);
        return { event: p ? event(p.lanId) : null, kind: p?.kind, town: p?.town, joinedAt: s.createdAt };
      }),
    },
    packingList: [
      ...packing.map((p) => ({ event: event(p.lanId), item: p.label, packed: p.packed, ownItem: true })),
      ...packed.map((p) => ({ event: event(p.lanId), item: p.item, packed: true, ownItem: false })),
    ],
    games: {
      suggested: games.map((g) => ({ event: event(g.lanId), name: g.name, sizeGb: g.sizeGb, url: g.url, at: g.createdAt })),
      votes: votes.map(({ v, g }) => ({ event: event(g.lanId), game: g.name, vote: v.vote, installed: v.installed })),
    },
    seatSwaps: swaps.map((s) => ({
      event: event(s.lanId),
      from: s.fromUserId === userId ? "you" : nameOf(s.fromUserId),
      to: s.toUserId === userId ? "you" : nameOf(s.toUserId),
      status: s.status,
      note: s.note,
      at: s.createdAt,
    })),
    orgaNewsPosted: news.map((n) => ({ event: event(n.lanId), text: n.text, at: n.createdAt })),
    auditLog: logRows.map((r) => ({
      at: r.at,
      by: r.actorId === userId ? "you" : logName(r.actorId, "Seatbit"),
      what: describeAudit(r, (id, fb) => (id === userId ? "you" : logName(id, fb))),
      clan: r.clanId ? clans.get(r.clanId) ?? null : null,
    })),
  };
}
