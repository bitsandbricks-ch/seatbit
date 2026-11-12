import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { fmtDay } from "./format";
import { moveLanAccounts } from "./lan-accounts";
import { appUrl } from "./mail";
import { sendTemplate } from "./mail-templates";
import { notifyClanAdmins, notifyLater } from "./notify";
import { audit } from "./audit";
import { nameKeys } from "./names";

const { clanMember, attendance, seat, nickname, lanOrga } = schema;

export const normEmail = (e: string) => e.trim().toLowerCase();

/**
 * The real account `meId` takes over guest `g`: clan membership, attendance, seats,
 * nicks, orga roles, rides and sleeping spots move over, then the guest is deleted.
 * Where both have something for the same LAN, the real account's stays.
 * Empty first name / surname on the account are filled from the guest.
 */
export function mergeGuestInto(g: User, meId: string) {
  if (!g.isGuest || g.id === meId) return;
  db.transaction((tx) => {
    const me = tx.select().from(schema.user).where(eq(schema.user.id, meId)).get();
    if (!me) return;
    if ((!me.firstName && g.firstName) || (!me.lastName && g.lastName)) {
      const firstName = me.firstName || g.firstName;
      const lastName = me.lastName || g.lastName;
      tx.update(schema.user)
        .set({ firstName, lastName, name: `${firstName} ${lastName}`.trim() })
        .where(eq(schema.user.id, meId))
        .run();
    }
    for (const m of tx.select().from(clanMember).where(eq(clanMember.userId, g.id)).all()) {
      const mine = tx.select().from(clanMember).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, meId))).get();
      if (!mine) tx.update(clanMember).set({ userId: meId }).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, g.id))).run();
      else if (mine.role === "pending")
        tx.update(clanMember).set({ role: m.role }).where(and(eq(clanMember.clanId, m.clanId), eq(clanMember.userId, meId))).run();
    }
    for (const a of tx.select().from(attendance).where(eq(attendance.userId, g.id)).all()) {
      const mine = tx.select().from(attendance).where(and(eq(attendance.lanId, a.lanId), eq(attendance.userId, meId))).get();
      if (!mine) tx.update(attendance).set({ userId: meId }).where(eq(attendance.id, a.id)).run();
    }
    for (const s of tx.select().from(seat).where(eq(seat.userId, g.id)).all()) {
      const mine = tx.select().from(seat).where(and(eq(seat.lanId, s.lanId), eq(seat.userId, meId))).get();
      if (!mine) tx.update(seat).set({ userId: meId }).where(eq(seat.id, s.id)).run();
    }
    const myNicks = tx.select().from(nickname).where(eq(nickname.userId, meId)).all();
    for (const n of tx.select().from(nickname).where(eq(nickname.userId, g.id)).all()) {
      if (!myNicks.some((x) => x.lanId === n.lanId && x.typeId === n.typeId))
        tx.update(nickname).set({ userId: meId }).where(eq(nickname.id, n.id)).run();
    }
    moveLanAccounts(tx, g.id, meId);
    for (const o of tx.select().from(lanOrga).where(eq(lanOrga.userId, g.id)).all()) {
      const mine = tx.select().from(lanOrga).where(and(eq(lanOrga.lanId, o.lanId), eq(lanOrga.userId, meId))).get();
      if (!mine) tx.update(lanOrga).set({ userId: meId }).where(and(eq(lanOrga.lanId, o.lanId), eq(lanOrga.userId, g.id))).run();
    }
    // Rides and sleeping spots noted for the guest.
    tx.update(schema.travelPost).set({ userId: meId }).where(eq(schema.travelPost.userId, g.id)).run();
    for (const sp of tx.select().from(schema.travelSpot).where(eq(schema.travelSpot.userId, g.id)).all()) {
      const post = tx.select().from(schema.travelPost).where(eq(schema.travelPost.id, sp.postId)).get();
      const mine = tx
        .select()
        .from(schema.travelSpot)
        .where(and(eq(schema.travelSpot.postId, sp.postId), eq(schema.travelSpot.userId, meId)))
        .get();
      if (mine || post?.userId === meId) tx.delete(schema.travelSpot).where(eq(schema.travelSpot.id, sp.id)).run();
      else tx.update(schema.travelSpot).set({ userId: meId }).where(eq(schema.travelSpot.id, sp.id)).run();
    }
    // Seat wishes of others that name the guest now name the real account.
    for (const col of ["wish_near", "wish_avoid"] as const)
      tx.run(sql`UPDATE attendance SET ${sql.raw(col)} = replace(${sql.raw(col)}, ${`"${g.id}"`}, ${`"${meId}"`}) WHERE ${sql.raw(col)} LIKE ${`%"${g.id}"%`}`);
    tx.delete(schema.user).where(eq(schema.user.id, g.id)).run();
  });
  // Let the clan admins know the guest now has a real account.
  if (g.guestClanId) {
    const clanId = g.guestClanId;
    notifyLater(async () => {
      const me = db.select().from(schema.user).where(eq(schema.user.id, meId)).get();
      const c = db.select().from(schema.clan).where(eq(schema.clan.id, clanId)).get();
      if (!me || !c) return;
      await notifyClanAdmins(clanId, {
        kind: "guest_claimed",
        subject: `${g.name} claimed their guest profile`,
        text: `${g.name} signed up and took over their guest profile in ${c.name}. They're now ${me.name}, with their events, seat and nick.`,
        url: `${appUrl}/clans/${c.slug}/settings?tab=members`,
      });
    });
  }
}

/**
 * Takes over every guest whose invite email matches the account's email, but only
 * when the sign-in provider (Discord) says that email is verified. Returns how many.
 */
export function claimGuestsByEmail(userId: string) {
  const me = db.select().from(schema.user).where(eq(schema.user.id, userId)).get();
  if (!me || me.isGuest || !me.emailVerified) return 0;
  const guests = db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.isGuest, true), sql`lower(${schema.user.inviteEmail}) = ${normEmail(me.email)}`))
    .all();
  for (const g of guests) {
    audit({ actorId: me.id, action: "guest.claimed", clanId: g.guestClanId, data: { guest: g.name } });
    mergeGuestInto(g, me.id);
  }
  return guests.length;
}

/** The real (non-guest) account with this email, if there is one. */
export function accountByEmail(email: string) {
  return db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.isGuest, false), sql`lower(${schema.user.email}) = ${normEmail(email)}`))
    .get();
}

/** Mails a guest their invite with the claim link, and notes when it went out. */
export async function sendGuestInvite(guestId: string, inviter: string) {
  const g = db.select().from(schema.user).where(eq(schema.user.id, guestId)).get();
  if (!g?.isGuest || !g.inviteEmail || !g.claimCode) return false;
  const clan = g.guestClanId ? db.select().from(schema.clan).where(eq(schema.clan.id, g.guestClanId)).get() : null;
  const lanIds = db
    .select({ lanId: attendance.lanId })
    .from(attendance)
    .where(and(eq(attendance.userId, g.id), inArray(attendance.status, ["going", "waitlist", "maybe"])))
    .all()
    .map((a) => a.lanId);
  const lans = lanIds.length
    ? db
        .select()
        .from(schema.lan)
        .where(and(inArray(schema.lan.id, lanIds), gt(schema.lan.endsAt, new Date()), isNotNull(schema.lan.publishedAt)))
        .orderBy(asc(schema.lan.startsAt))
        .all()
    : [];
  await sendTemplate(g.inviteEmail, "guestInvite", {
    firstName: g.firstName || g.name,
    clan: clan?.name ?? "your clan",
    inviter,
    events: lans.map((l) => `${l.name} (${fmtDay(l.startsAt)})`).join(", "),
    link: `${appUrl}/claim/${g.claimCode}`,
  });
  db.update(schema.user).set({ invitedAt: new Date() }).where(eq(schema.user.id, g.id)).run();
  return true;
}

// ---------------- Members claiming guests ----------------

export type GuestMatch = "name" | "nick";
export type GuestSuggestion = {
  guest: User;
  /** Same name or nick as the member, or null. */
  match: GuestMatch | null;
  /** The member's own request for this guest, if any. */
  status: "pending" | "declined" | "dismissed" | null;
  claimId: string | null;
};

/** Nicks shorter than this (after folding) are too generic to count as a match. */
const MIN_NICK = 3;

function keysFor(userIds: string[]) {
  const users = userIds.length ? db.select().from(schema.user).where(inArray(schema.user.id, userIds)).all() : [];
  const nicks = userIds.length ? db.select().from(nickname).where(inArray(nickname.userId, userIds)).all() : [];
  return new Map(
    users.map((u) => [
      u.id,
      {
        name: new Set(nameKeys(`${u.firstName} ${u.lastName}`).filter((k) => k.includes(" "))),
        nick: new Set(nicks.filter((n) => n.userId === u.id).flatMap((n) => nameKeys(n.nick)).filter((k) => k.length >= MIN_NICK)),
      },
    ]),
  );
}

const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((k) => b.has(k));

/** The clan's guests nobody has taken over yet, newest last. */
export function unclaimedGuests(clanId: string) {
  return db
    .select({ u: schema.user })
    .from(clanMember)
    .innerJoin(schema.user, eq(schema.user.id, clanMember.userId))
    .where(and(eq(clanMember.clanId, clanId), eq(schema.user.isGuest, true), eq(schema.user.guestClanId, clanId)))
    .all()
    .map((r) => r.u);
}

/**
 * The clan's guests as the member sees them on the claim page: whether the name or a
 * nick matches theirs, and what they already said about each. Matches come first.
 */
export function guestSuggestions(clanId: string, userId: string): GuestSuggestion[] {
  const guests = unclaimedGuests(clanId);
  if (!guests.length) return [];
  const keys = keysFor([userId, ...guests.map((g) => g.id)]);
  const mine = keys.get(userId);
  const claims = db
    .select()
    .from(schema.guestClaim)
    .where(and(eq(schema.guestClaim.clanId, clanId), eq(schema.guestClaim.userId, userId)))
    .all();
  return guests
    .map((g) => {
      const k = keys.get(g.id);
      const match: GuestMatch | null =
        mine && k ? (overlaps(mine.name, k.name) ? "name" : overlaps(mine.nick, k.nick) ? "nick" : null) : null;
      const c = claims.find((x) => x.guestId === g.id);
      return { guest: g, match, status: c?.status ?? null, claimId: c?.id ?? null };
    })
    .sort((a, b) => Number(!!b.match) - Number(!!a.match) || a.guest.name.localeCompare(b.guest.name));
}

/** Guests that look like the member and that they haven't answered yet. */
export function openGuestMatches(clanId: string, userId: string) {
  return guestSuggestions(clanId, userId).filter((s) => s.match && !s.status);
}

/**
 * Whether a member may take over this guest right away instead of asking an admin:
 * the clan allows it, the name or nick matches, and nothing about the guest asks
 * for a second look (orgas gave them an email, which isn't the member's, or made them admin).
 */
export function canClaimDirectly(mode: string, s: Pick<GuestSuggestion, "guest" | "match">, guestRole: string | null) {
  return mode === "match" && !!s.match && !s.guest.inviteEmail && guestRole !== "admin";
}
