"use server";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { rolesWith } from "@/lib/clan-roles";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { getDisplayNames, getLan } from "@/lib/lans";
import { appUrl } from "@/lib/mail";
import { notify, notifyLater, notifySeatChanged, sendDiscordDm } from "@/lib/notify";
import { NUDGE_STEPS, nudge, type NudgeResult, type NudgeStep } from "@/lib/missing";
import { clearSeatBooked, remindToBook, setSeatBooked } from "@/lib/seat-booking";
import { canViewLan, isLanManager, requireLanManager, requireUser } from "@/lib/session";
import { auditLan } from "@/lib/audit";

const { seat, seatSwap, game, gameVote, lanOrga, clanMember, user } = schema;

function mustGetLan(id: string) {
  const l = getLan(id);
  if (!l) throw new Error("LAN not found");
  return l;
}

const lanPath = (id: string) => {
  revalidatePath(`/lans/${id}`);
  revalidatePath(`/lans/${id}/manage`);
};

const lanUrl = (l: Lan, tab?: string) => `${appUrl}/lans/${l.id}${tab ? `?tab=${tab}` : ""}`;

// ---------------- Seat booking on the event site ----------------

/** Member ticks (or unticks) "I booked my seat on the event's seat plan". */
export async function setMySeatBooked(lanId: string, booked: boolean) {
  const me = await requireUser();
  setSeatBooked(lanId, me.id, booked);
  lanPath(lanId);
}

/** Lead corrects someone's "booked" tick. */
export async function adminSetSeatBooked(lanId: string, userId: string, booked: boolean) {
  const me = await requireLanManager(lanId);
  setSeatBooked(lanId, userId, booked);
  if (userId !== me.id) auditLan(mustGetLan(lanId), me.id, "seatbooked.set", { targetUserId: userId, data: { booked } });
  lanPath(lanId);
}

/** Lead button: remind everyone with a seat they haven't booked yet. */
export async function adminRemindToBook(lanId: string): Promise<number> {
  await requireLanManager(lanId);
  return remindToBook(mustGetLan(lanId));
}

// ---------------- Seat swaps ----------------

const OPEN = ["pending", "accepted"] as const;

/** Leads of a LAN, or the clan admins and event managers when it has none. They approve swaps. */
function orgasOf(l: Lan) {
  const ids = db.select().from(lanOrga).where(eq(lanOrga.lanId, l.id)).all().map((o) => o.userId);
  if (ids.length) return db.select().from(user).where(inArray(user.id, ids)).all();
  return db
    .select({ u: user })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(and(eq(clanMember.clanId, l.clanId ?? ""), inArray(clanMember.role, rolesWith("events"))))
    .all()
    .map((r) => r.u);
}

function seatOf(lanId: string, userId: string) {
  return db.select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.userId, userId))).get();
}

/** Asks another attendee to swap seats. Both need a seat, and the plan must be out. */
export async function requestSeatSwap(lanId: string, toUserId: string, note = "") {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (!canViewLan(me, lanId)) throw new Error("Not found");
  if (!l.seatsPublishedAt) throw new Error("Swaps open once the leads finalize the seat plan.");
  if (toUserId === me.id) throw new Error("Pick someone else.");
  const mine = seatOf(lanId, me.id);
  const theirs = seatOf(lanId, toUserId);
  if (!mine) throw new Error("You don't have a seat yet.");
  if (!theirs) throw new Error("They don't have a seat.");
  const open = db
    .select()
    .from(seatSwap)
    .where(and(eq(seatSwap.lanId, lanId), inArray(seatSwap.status, [...OPEN]), or(eq(seatSwap.fromUserId, me.id), eq(seatSwap.toUserId, me.id))))
    .all();
  if (open.some((s) => s.fromUserId === me.id)) throw new Error("You already asked someone. Cancel that request first.");
  if (open.some((s) => s.fromUserId === toUserId)) throw new Error("They already asked you. Answer their request instead.");
  db.insert(seatSwap).values({ lanId, fromUserId: me.id, toUserId, note: note.trim().slice(0, 200) }).run();
  const names = await getDisplayNames(lanId, [me.id]);
  notifyLater(() =>
    notify(toUserId, {
      kind: "seat_swap",
      subject: `${names.get(me.id)} wants to swap seats at ${l.name}`,
      text: `${names.get(me.id)} (seat ${mine.label}) asks to swap with your seat ${theirs.label} at ${l.name}.${note.trim() ? `\n\n"${note.trim().slice(0, 200)}"` : ""}\n\nAccept or decline on the event page. A lead approves the swap afterwards.`,
      url: lanUrl(l),
      dmOnly: true,
    }),
  );
  lanPath(lanId);
}

/** The asked member accepts or declines. Accepting sends it to the leads. */
export async function answerSeatSwap(swapId: string, accept: boolean) {
  const me = await requireUser();
  const s = db.select().from(seatSwap).where(eq(seatSwap.id, swapId)).get();
  if (!s || s.toUserId !== me.id || s.status !== "pending") throw new Error("This request is no longer open.");
  const l = mustGetLan(s.lanId);
  db.update(seatSwap)
    .set({ status: accept ? "accepted" : "declined", decidedAt: accept ? null : new Date() })
    .where(eq(seatSwap.id, swapId))
    .run();
  const names = await getDisplayNames(l.id, [s.fromUserId, s.toUserId]);
  const [a, b] = [names.get(s.fromUserId), names.get(s.toUserId)];
  notifyLater(async () => {
    await notify(s.fromUserId, {
      kind: "seat_swap",
      subject: accept ? `${b} agreed to swap seats` : `${b} declined your seat swap`,
      text: accept
        ? `${b} agreed to swap seats with you at ${l.name}. A lead still has to approve it.`
        : `${b} doesn't want to swap seats at ${l.name}.`,
      url: lanUrl(l),
      dmOnly: true,
    });
    if (accept)
      for (const o of orgasOf(l))
        await sendDiscordDm(o, {
          kind: "seat_swap",
          subject: `Seat swap to approve: ${a} ⇄ ${b}`,
          text: `${a} and ${b} want to swap seats at ${l.name}. Approve or reject it on the Seats tab.`,
          url: `${appUrl}/lans/${l.id}/manage?tab=seats`,
        });
  });
  lanPath(l.id);
}

/** The asking member withdraws their request. */
export async function cancelSeatSwap(swapId: string) {
  const me = await requireUser();
  const s = db.select().from(seatSwap).where(eq(seatSwap.id, swapId)).get();
  if (!s || s.fromUserId !== me.id || !OPEN.includes(s.status as (typeof OPEN)[number])) return;
  db.update(seatSwap).set({ status: "cancelled", decidedAt: new Date() }).where(eq(seatSwap.id, swapId)).run();
  lanPath(s.lanId);
}

/** Lead approves (swaps the two seats as they are now) or rejects an accepted swap. */
export async function decideSeatSwap(swapId: string, approve: boolean) {
  const s = db.select().from(seatSwap).where(eq(seatSwap.id, swapId)).get();
  if (!s) throw new Error("Not found");
  const me = await requireLanManager(s.lanId);
  if (!OPEN.includes(s.status as (typeof OPEN)[number])) throw new Error("This request is already closed.");
  const l = mustGetLan(s.lanId);
  const logDecision = () =>
    auditLan(l, me.id, "swap.decide", { targetUserId: s.fromUserId, data: { approved: approve, otherUserId: s.toUserId } });
  if (!approve) {
    db.update(seatSwap).set({ status: "rejected", decidedAt: new Date() }).where(eq(seatSwap.id, swapId)).run();
    logDecision();
    notifyLater(async () => {
      for (const uid of [s.fromUserId, s.toUserId])
        await notify(uid, {
          kind: "seat_swap",
          subject: `Seat swap at ${l.name} not approved`,
          text: `The leads didn't approve the seat swap at ${l.name}. Your seat stays the same. Ask them if you want to know why.`,
          url: lanUrl(l),
          dmOnly: true,
        });
    });
    lanPath(l.id);
    return;
  }
  const a = seatOf(l.id, s.fromUserId);
  const b = seatOf(l.id, s.toUserId);
  if (!a || !b) throw new Error("One of them no longer has a seat. Reject the request.");
  db.transaction((tx) => {
    tx.update(seat).set({ userId: null }).where(inArray(seat.id, [a.id, b.id])).run();
    tx.update(seat).set({ userId: s.toUserId }).where(eq(seat.id, a.id)).run();
    tx.update(seat).set({ userId: s.fromUserId }).where(eq(seat.id, b.id)).run();
    tx.update(seatSwap).set({ status: "approved", decidedAt: new Date() }).where(eq(seatSwap.id, swapId)).run();
    // Other open requests involving these two refer to seats that just changed.
    tx.update(seatSwap)
      .set({ status: "cancelled", decidedAt: new Date() })
      .where(
        and(
          eq(seatSwap.lanId, l.id),
          ne(seatSwap.id, swapId),
          inArray(seatSwap.status, [...OPEN]),
          or(
            inArray(seatSwap.fromUserId, [s.fromUserId, s.toUserId]),
            inArray(seatSwap.toUserId, [s.fromUserId, s.toUserId]),
          ),
        ),
      )
      .run();
  });
  clearSeatBooked(l.id, [s.fromUserId, s.toUserId]);
  logDecision();
  notifyLater(async () => {
    await notifySeatChanged(l, s.fromUserId, b.label);
    await notifySeatChanged(l, s.toUserId, a.label);
  });
  lanPath(l.id);
}

// ---------------- Games ----------------

const gameInput = z.object({
  name: z.string().trim().min(1).max(60),
  sizeGb: z
    .string()
    .optional()
    .transform((v) => (v ? Math.round(Number(v)) : null))
    .pipe(z.number().int().min(0).max(2000).nullable()),
  url: z.union([z.literal(""), z.url().max(500)]).default(""),
});

async function requireLanViewer(lanId: string) {
  const me = await requireUser();
  if (!canViewLan(me, lanId)) throw new Error("Join the clan first");
  return me;
}

/** Suggests a game; the one who adds it votes for it. */
export async function addGame(lanId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireLanViewer(lanId);
  mustGetLan(lanId);
  const parsed = gameInput.safeParse({
    name: formData.get("name") ?? "",
    sizeGb: formData.get("sizeGb") ?? "",
    url: String(formData.get("url") ?? "").trim(),
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ") };
  const existing = db
    .select()
    .from(game)
    .where(eq(game.lanId, lanId))
    .all()
    .find((g) => g.name.toLowerCase() === parsed.data.name.toLowerCase());
  if (existing) return { error: `${existing.name} is already on the list. Vote for it instead.` };
  if (db.select().from(game).where(eq(game.lanId, lanId)).all().length >= 50) return { error: "The list is full (50 games)." };
  const g = db.insert(game).values({ lanId, ...parsed.data, addedBy: me.id }).returning().get();
  db.insert(gameVote).values({ gameId: g.id, userId: me.id, vote: true }).run();
  lanPath(lanId);
  return {};
}

/** Removes a game: whoever added it, or a lead. */
export async function deleteGame(gameId: string) {
  const me = await requireUser();
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) return;
  if (g.addedBy !== me.id && !isLanManager(me, g.lanId)) throw new Error("Only who added it or a lead can remove it.");
  db.delete(game).where(eq(game.id, gameId)).run();
  lanPath(g.lanId);
}

/** Sets my vote or "installed" tick for a game. */
export async function setGameMark(gameId: string, field: "vote" | "installed", value: boolean) {
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) throw new Error("Not found");
  const me = await requireLanViewer(g.lanId);
  db.insert(gameVote)
    .values({ gameId, userId: me.id, [field]: value })
    .onConflictDoUpdate({ target: [gameVote.gameId, gameVote.userId], set: { [field]: value } })
    .run();
  lanPath(g.lanId);
}

// ---------------- Who's missing ----------------

/** Lead nudge from the "Who's missing" tab: one person, or everyone missing a step. */
export async function nudgeMissing(lanId: string, step: string, userIds?: string[]): Promise<NudgeResult> {
  await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (!l.publishedAt) throw new Error("Publish the event first. Members can't see drafts.");
  if (l.cancelledAt) throw new Error("This event is cancelled.");
  if (!NUDGE_STEPS.includes(step as NudgeStep)) throw new Error("Unknown step");
  const r = await nudge(l, step as NudgeStep, userIds);
  lanPath(lanId);
  return r;
}
