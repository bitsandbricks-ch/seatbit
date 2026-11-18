"use server";
import { err, getT, tr } from "@/i18n/server";
import { formError } from "@/i18n/form-errors";

import { and, eq, inArray, ne, or } from "drizzle-orm";
import { rolesWith } from "@/lib/clan-roles";
import { revalidatePath } from "next/cache";
import { lanChanged } from "@/lib/live";
import { z } from "zod";
import { db, schema } from "@/db";
import type { Lan } from "@/db/schema";
import { getDisplayNames, mustGetLan } from "@/lib/lans";
import { appUrl } from "@/lib/mail";
import { notify, notifyLater, notifySeatChanged, sendDiscordDm } from "@/lib/notify";
import { NUDGE_STEPS, nudge, type NudgeResult, type NudgeStep } from "@/lib/missing";
import { clearSeatBooked, setSeatBooked } from "@/lib/seat-booking";
import { canTakePart, isLanManager, requireLanManager, requireUser } from "@/lib/session";
import { auditLan } from "@/lib/audit";
import { optionalHttpUrl } from "@/lib/safe-url";
import { enforceLimit } from "@/lib/rate-limit";
import { canEditCatalog, catalogByName, getCatalogGame, linkSteam, nameKey, resolveCatalog, syncEventNames } from "@/lib/game-catalog";
import { steamAppIdFromUrl } from "@/lib/steam";

const { seat, seatSwap, game, gameVote, lanOrga, clanMember, user } = schema;

const lanPath = (id: string) => {
  lanChanged(id);
  revalidatePath(`/lans/${id}`);
  revalidatePath(`/lans/${id}/manage`);
};

const lanUrl = (l: Lan, tab?: string) => `${appUrl}/lans/${l.id}${tab ? `?tab=${tab}` : ""}`;

// ---------------- Seat booking on the event site ----------------

/** A lead ticks (or unticks) that they booked someone's seat on the event site. */
export async function adminSetSeatBooked(lanId: string, userId: string, booked: boolean) {
  const me = await requireLanManager(lanId);
  setSeatBooked(lanId, userId, booked, await getT());
  if (userId !== me.id) auditLan(mustGetLan(lanId), me.id, "seatbooked.set", { targetUserId: userId, data: { booked } });
  lanPath(lanId);
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
  if (!canTakePart(me, lanId)) throw await err("errors.gone");
  if (!l.seatsPublishedAt) throw await err("errors.swapsLater");
  if (toUserId === me.id) throw await err("errors.pickElse");
  const mine = seatOf(lanId, me.id);
  const theirs = seatOf(lanId, toUserId);
  if (!mine) throw await err("errors.noSeatYet");
  if (!theirs) throw await err("errors.theyNoSeat");
  const open = db
    .select()
    .from(seatSwap)
    .where(and(eq(seatSwap.lanId, lanId), inArray(seatSwap.status, [...OPEN]), or(eq(seatSwap.fromUserId, me.id), eq(seatSwap.toUserId, me.id))))
    .all();
  if (open.some((s) => s.fromUserId === me.id)) throw await err("errors.askedAlready");
  if (open.some((s) => s.fromUserId === toUserId)) throw await err("errors.theyAsked");
  db.insert(seatSwap).values({ lanId, fromUserId: me.id, toUserId, note: note.trim().slice(0, 200) }).run();
  const names = await getDisplayNames(lanId, [me.id]);
  notifyLater(() =>
    notify(toUserId, (t) => ({
      kind: "seat_swap",
      subject: t("notice.swapAsk", { name: names.get(me.id) ?? "", lan: l.name }),
      text: `${t("notice.swapAskText", { name: names.get(me.id) ?? "", mine: mine.label, theirs: theirs.label, lan: l.name })}${note.trim() ? `\n\n«${note.trim().slice(0, 200)}»` : ""}\n\n${t("notice.swapAskHow")}`,
      url: lanUrl(l),
      dmOnly: true,
    })),
  );
  lanPath(lanId);
}

/** The asked member accepts or declines. Accepting sends it to the leads. */
export async function answerSeatSwap(swapId: string, accept: boolean) {
  const me = await requireUser();
  const s = db.select().from(seatSwap).where(eq(seatSwap.id, swapId)).get();
  if (!s || s.toUserId !== me.id || s.status !== "pending") throw await err("errors.requestGone");
  const l = mustGetLan(s.lanId);
  db.update(seatSwap)
    .set({ status: accept ? "accepted" : "declined", decidedAt: accept ? null : new Date() })
    .where(eq(seatSwap.id, swapId))
    .run();
  const names = await getDisplayNames(l.id, [s.fromUserId, s.toUserId]);
  const [a, b] = [names.get(s.fromUserId), names.get(s.toUserId)];
  notifyLater(async () => {
    await notify(s.fromUserId, (t) => ({
      kind: "seat_swap",
      subject: t(accept ? "notice.swapAgreed" : "notice.swapDeclined", { name: b ?? "" }),
      text: t(accept ? "notice.swapAgreedText" : "notice.swapDeclinedText", { name: b ?? "", lan: l.name }),
      url: lanUrl(l),
      dmOnly: true,
    }));
    if (accept)
      for (const o of orgasOf(l))
        await sendDiscordDm(o, (t) => ({
          kind: "seat_swap",
          subject: t("notice.swapApprove", { a: a ?? "", b: b ?? "" }),
          text: t("notice.swapApproveText", { a: a ?? "", b: b ?? "", lan: l.name }),
          url: `${appUrl}/lans/${l.id}/manage?tab=seats`,
        }));
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
  if (!s) throw await err("errors.gone");
  const me = await requireLanManager(s.lanId);
  if (!OPEN.includes(s.status as (typeof OPEN)[number])) throw await err("errors.requestClosed");
  const l = mustGetLan(s.lanId);
  const logDecision = () =>
    auditLan(l, me.id, "swap.decide", { targetUserId: s.fromUserId, data: { approved: approve, otherUserId: s.toUserId } });
  if (!approve) {
    db.update(seatSwap).set({ status: "rejected", decidedAt: new Date() }).where(eq(seatSwap.id, swapId)).run();
    logDecision();
    notifyLater(async () => {
      for (const uid of [s.fromUserId, s.toUserId])
        await notify(uid, (t) => ({
          kind: "seat_swap",
          subject: t("notice.swapRejected", { lan: l.name }),
          text: t("notice.swapRejectedText", { lan: l.name }),
          url: lanUrl(l),
          dmOnly: true,
        }));
    });
    lanPath(l.id);
    return;
  }
  const a = seatOf(l.id, s.fromUserId);
  const b = seatOf(l.id, s.toUserId);
  if (!a || !b) throw await err("errors.swapNoSeat");
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

const optInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Math.round(Number(v)) : null))
    .pipe(z.number().int().min(min).max(max).nullable());

const optBool = z
  .enum(["", "yes", "no"])
  .optional()
  .transform((v) => (v === "yes" ? true : v === "no" ? false : null));

const gameInput = z.object({
  name: z.string().trim().min(1).max(60),
  sizeGb: optInt(0, 2000),
  url: optionalHttpUrl().default(""),
  catalogId: z.string().max(64).optional(),
  steamAppId: optInt(1, 9_999_999_999),
});

/** Catalog details, only sent by the edit form when I may change them. */
const detailsInput = z
  .object({
    sizeGb: optInt(0, 2000),
    url: optionalHttpUrl().default(""),
    minPlayers: optInt(1, 1000),
    maxPlayers: optInt(1, 1000),
    free: optBool,
    lan: optBool,
  })
  .refine((d) => d.minPlayers == null || d.maxPlayers == null || d.minPlayers <= d.maxPlayers, { path: ["maxPlayers"] });

async function requireParticipant(lanId: string) {
  const me = await requireUser();
  if (!canTakePart(me, lanId)) throw await err("errors.joinFirst");
  return me;
}

const field = (formData: FormData, k: string) => {
  const v = formData.get(k);
  return v == null ? undefined : String(v).trim();
};

const parseGame = (formData: FormData) =>
  gameInput.safeParse({
    name: formData.get("name") ?? "",
    sizeGb: formData.get("sizeGb") ?? "",
    url: String(formData.get("url") ?? "").trim(),
    catalogId: field(formData, "catalogId") || undefined,
    steamAppId: field(formData, "steamAppId") ?? "",
  });

/** Another game of the LAN with the same name (case-insensitive) or catalog entry, so the list has no duplicates. */
const sameGame = (lanId: string, name: string, catalogId: string | null, exceptId?: string) =>
  db
    .select()
    .from(game)
    .where(eq(game.lanId, lanId))
    .all()
    .find((g) => g.id !== exceptId && (nameKey(g.name) === nameKey(name) || (!!catalogId && g.catalogId === catalogId)));

/** Suggests a game, from the catalog or new to it; the one who adds it votes for it. */
export async function addGame(lanId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireParticipant(lanId);
  mustGetLan(lanId);
  const parsed = parseGame(formData);
  if (!parsed.success) return { error: formError(parsed.error, await getT()) };
  const before = sameGame(lanId, parsed.data.name, parsed.data.catalogId ?? null);
  if (before) return { error: await tr("errors.gameExists", { name: before.name }) };
  if (db.select().from(game).where(eq(game.lanId, lanId)).all().length >= 50) return { error: await tr("errors.gamesFull") };
  const c = await resolveCatalog(parsed.data, me.id);
  // Steam may know it under another name that is on the list already.
  const existing = sameGame(lanId, c.name, c.id);
  if (existing) return { error: await tr("errors.gameExists", { name: existing.name }) };
  const g = db.insert(game).values({ lanId, catalogId: c.id, name: c.name, addedBy: me.id }).returning().get();
  db.insert(gameVote).values({ gameId: g.id, userId: me.id, vote: true }).run();
  lanPath(lanId);
  return {};
}

/**
 * Fixes a game on an event: whoever added it, or a lead. A new name points the event at another
 * catalog game (or renames the entry, when I keep it and only this event uses it). The details
 * change the catalog entry, so only whoever put it in the catalog or platform staff send them.
 * Votes and ticks stay.
 */
export async function updateGame(gameId: string, formData: FormData): Promise<{ error?: string }> {
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) throw await err("errors.gone");
  // Taking part first: who added it may have left the clan since.
  const me = await requireParticipant(g.lanId);
  if (g.addedBy !== me.id && !isLanManager(me, g.lanId)) throw await err("errors.gameEdit");
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: formError(name.error, await getT()) };
  const sendsDetails = formData.has("sizeGb");
  const details = sendsDetails
    ? detailsInput.safeParse({
        sizeGb: field(formData, "sizeGb") ?? "",
        url: field(formData, "url") ?? "",
        minPlayers: field(formData, "minPlayers") ?? "",
        maxPlayers: field(formData, "maxPlayers") ?? "",
        free: field(formData, "free") ?? "",
        lan: field(formData, "lan") ?? "",
      })
    : null;
  if (details && !details.success) return { error: formError(details.error, await getT()) };

  // Games from before the catalog get their entry now, made by whoever added them.
  let c = (g.catalogId && getCatalogGame(g.catalogId)) || (await resolveCatalog({ name: g.name, sizeGb: g.sizeGb, url: g.url }, g.addedBy));
  const wasLegacy = !g.catalogId;
  if (nameKey(name.data) !== nameKey(c.name)) {
    const taken = sameGame(g.lanId, name.data, null, g.id);
    if (taken) return { error: await tr("errors.gameNameTaken", { name: taken.name }) };
    const other = catalogByName(name.data);
    const onlyHere = db.select().from(game).where(eq(game.catalogId, c.id)).all().every((x) => x.id === g.id);
    if (!other && onlyHere && (canEditCatalog(me, c) || wasLegacy) && !c.steamAppId) {
      db.update(schema.catalogGame).set({ name: name.data, nameKey: nameKey(name.data) }).where(eq(schema.catalogGame.id, c.id)).run();
    } else {
      c = await resolveCatalog({ name: name.data, ...(details?.data ? { sizeGb: details.data.sizeGb, url: details.data.url } : {}) }, me.id);
      const dup = sameGame(g.lanId, c.name, c.id, g.id);
      if (dup) return { error: await tr("errors.gameNameTaken", { name: dup.name }) };
    }
  } else if (name.data !== c.name && (canEditCatalog(me, c) || wasLegacy)) {
    // Only the spelling changed ("cs2" → "CS2").
    db.update(schema.catalogGame).set({ name: name.data }).where(eq(schema.catalogGame.id, c.id)).run();
  }
  c = getCatalogGame(c.id)!;

  if (details?.data) {
    if (!canEditCatalog(me, c) && !(wasLegacy && c.createdBy === g.addedBy)) throw await err("errors.gameDetails");
    const d = details.data;
    const appId = steamAppIdFromUrl(d.url);
    db.update(schema.catalogGame).set(d).where(eq(schema.catalogGame.id, c.id)).run();
    if (appId && !c.steamAppId) await linkSteam(c.id, appId);
  }
  db.update(game).set({ catalogId: c.id, name: getCatalogGame(c.id)!.name }).where(eq(game.id, gameId)).run();
  syncEventNames(getCatalogGame(c.id)!);
  lanPath(g.lanId);
  return {};
}

/** Removes a game from the event (the catalog keeps it): whoever added it, or a lead. */
export async function deleteGame(gameId: string) {
  const me = await requireUser();
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) return;
  if (g.addedBy !== me.id && !isLanManager(me, g.lanId)) throw await err("errors.gameRemove");
  db.delete(game).where(eq(game.id, gameId)).run();
  lanPath(g.lanId);
}

/** Sets my vote or "installed" tick for a game. */
export async function setGameMark(gameId: string, field: "vote" | "installed", value: boolean) {
  const g = db.select().from(game).where(eq(game.id, gameId)).get();
  if (!g) throw await err("errors.gone");
  const me = await requireParticipant(g.lanId);
  db.insert(gameVote)
    .values({ gameId, userId: me.id, [field]: value })
    .onConflictDoUpdate({ target: [gameVote.gameId, gameVote.userId], set: { [field]: value } })
    .run();
  lanPath(g.lanId);
}

// ---------------- Who's missing ----------------

/** Lead nudge from the "Who's missing" tab: one person, or everyone missing a step. */
export async function nudgeMissing(lanId: string, step: string, userIds?: string[]): Promise<NudgeResult> {
  const me = await requireLanManager(lanId);
  await enforceLimit("send", me.id);
  const l = mustGetLan(lanId);
  if (!l.publishedAt) throw await err("errors.publishFirst");
  if (l.cancelledAt) throw await err("errors.cancelled");
  if (!NUDGE_STEPS.includes(step as NudgeStep)) throw new Error("Unknown step");
  const r = await nudge(l, step as NudgeStep, userIds);
  lanPath(lanId);
  return r;
}
