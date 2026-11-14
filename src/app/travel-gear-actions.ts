"use server";
import { err, getT } from "@/i18n/server";
import type { T } from "@/i18n/translate";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { lanChanged } from "@/lib/live";
import { z } from "zod";
import { db, schema } from "@/db";
import { TRAVEL_KINDS } from "@/db/schema";
import { getLan } from "@/lib/lans";
import { PACKING_ITEMS } from "@/lib/gear";
import { canTakePart, isLanManager, requireUser } from "@/lib/session";

const { attendance, travelPost, travelSpot, gearPacked, packingItem } = schema;

const refresh = (lanId: string) => {
  lanChanged(lanId);
  revalidatePath(`/lans/${lanId}`);
};

/** Signed-in clan member who answered coming, unsure or waitlist for this LAN. */
async function requireAttendee(lanId: string) {
  const me = await requireUser();
  if (!getLan(lanId) || !canTakePart(me, lanId)) throw new Error("LAN not found");
  const a = db
    .select({ status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id)))
    .get();
  if (!a || a.status === "declined") throw await err("errors.signUpFirst");
  return me;
}

function mustGetPost(postId: string) {
  const p = db.select().from(travelPost).where(eq(travelPost.id, postId)).get();
  if (!p) throw new Error("Not found");
  return p;
}

const takenPlaces = (postId: string) =>
  db.select({ id: travelSpot.id }).from(travelSpot).where(eq(travelSpot.postId, postId)).all().length;

// ---------------- Travel ----------------

const postInput = z.object({
  kind: z.enum(TRAVEL_KINDS),
  mode: z.enum(["offer", "request"]),
  town: z.string().trim().min(1, "Enter a town").max(40),
  places: z.coerce.number().int().min(1).max(20),
  whenText: z.string().trim().max(60).default(""),
  note: z.string().trim().max(200).default(""),
});

export type TravelInput = z.input<typeof postInput>;

/** Offer or ask for a ride / sleeping spot. With postId, edits the user's own post. */
export async function saveTravelPost(lanId: string, input: TravelInput, postId?: string) {
  const me = await requireAttendee(lanId);
  const v = postInput.parse(input);
  if (postId) {
    const p = mustGetPost(postId);
    if (p.userId !== me.id || p.lanId !== lanId) throw new Error("Not your post");
    if (p.mode === "offer" && v.places < takenPlaces(postId))
      throw await err("errors.placesTooFew");
    db.update(travelPost)
      .set({ town: v.town, places: v.places, whenText: v.whenText, note: v.note })
      .where(eq(travelPost.id, postId))
      .run();
  } else {
    db.insert(travelPost).values({ lanId, userId: me.id, ...v }).run();
  }
  refresh(lanId);
}

/** The author or a lead removes a post (its passengers/guests are released). */
export async function deleteTravelPost(postId: string) {
  const me = await requireUser();
  const p = mustGetPost(postId);
  if (p.userId !== me.id && !isLanManager(me, p.lanId)) throw new Error("Not your post");
  db.delete(travelPost).where(eq(travelPost.id, postId)).run();
  refresh(p.lanId);
}

/** Adds `userId` to an offer, and drops their open request of the same kind (it's solved). */
function addSpot(p: typeof travelPost.$inferSelect, userId: string, t: T) {
  if (p.mode !== "offer") throw new Error(t("errors.joinOffers"));
  if (p.userId === userId) throw new Error(t("errors.ownOffer"));
  db.transaction((tx) => {
    const taken = tx.select({ id: travelSpot.id }).from(travelSpot).where(eq(travelSpot.postId, p.id)).all().length;
    if (taken >= p.places) throw new Error(t("errors.noPlaces"));
    tx.insert(travelSpot).values({ postId: p.id, userId }).onConflictDoNothing().run();
    tx.delete(travelPost)
      .where(
        and(
          eq(travelPost.lanId, p.lanId),
          eq(travelPost.userId, userId),
          eq(travelPost.kind, p.kind),
          eq(travelPost.mode, "request"),
        ),
      )
      .run();
  });
}

export async function joinTravelOffer(postId: string) {
  const p = mustGetPost(postId);
  const me = await requireAttendee(p.lanId);
  addSpot(p, me.id, await getT());
  refresh(p.lanId);
}

/** Leave an offer you joined, or (as its author or a lead) remove someone from it. */
export async function leaveTravelOffer(postId: string, userId?: string) {
  const me = await requireUser();
  const p = mustGetPost(postId);
  const target = userId ?? me.id;
  if (target !== me.id && p.userId !== me.id && !isLanManager(me, p.lanId)) throw new Error("Not allowed");
  db.delete(travelSpot).where(and(eq(travelSpot.postId, postId), eq(travelSpot.userId, target))).run();
  refresh(p.lanId);
}

/** A driver/host answers a request: the requester gets a place in the driver's offer of that kind. */
export async function takeAlong(requestId: string, offerId: string) {
  const req = mustGetPost(requestId);
  const me = await requireAttendee(req.lanId);
  const offer = mustGetPost(offerId);
  if (req.mode !== "request" || offer.userId !== me.id || offer.lanId !== req.lanId || offer.kind !== req.kind)
    throw await err("errors.pickOwnOffer");
  addSpot(offer, req.userId, await getT());
  refresh(req.lanId);
}

// ---------------- Gear ----------------

/** Tick or untick an item on the member's own packing list. */
export async function setPacked(lanId: string, item: string, packed: boolean) {
  const me = await requireUser();
  if (!canTakePart(me, lanId)) throw new Error("LAN not found");
  if (!PACKING_ITEMS.some((p) => p.id === item)) throw new Error("Unknown item");
  if (packed) db.insert(gearPacked).values({ lanId, userId: me.id, item }).onConflictDoNothing().run();
  else
    db.delete(gearPacked)
      .where(and(eq(gearPacked.lanId, lanId), eq(gearPacked.userId, me.id), eq(gearPacked.item, item)))
      .run();
  refresh(lanId);
}

const itemLabel = z.string().trim().min(1, "Enter an item").max(40);

/** Add an item of your own to your packing list. */
export async function addPackingItem(lanId: string, label: string) {
  const me = await requireUser();
  if (!canTakePart(me, lanId)) throw new Error("LAN not found");
  db.insert(packingItem).values({ lanId, userId: me.id, label: itemLabel.parse(label) }).run();
  refresh(lanId);
}

function mustGetMyItem(userId: string, itemId: string) {
  const it = db.select().from(packingItem).where(eq(packingItem.id, itemId)).get();
  if (!it || it.userId !== userId) throw new Error("Not found");
  return it;
}

export async function setPackingItemPacked(itemId: string, packed: boolean) {
  const me = await requireUser();
  const it = mustGetMyItem(me.id, itemId);
  db.update(packingItem).set({ packed }).where(eq(packingItem.id, it.id)).run();
  refresh(it.lanId);
}

export async function deletePackingItem(itemId: string) {
  const me = await requireUser();
  const it = mustGetMyItem(me.id, itemId);
  db.delete(packingItem).where(eq(packingItem.id, it.id)).run();
  refresh(it.lanId);
}
