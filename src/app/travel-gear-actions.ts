"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { TRAVEL_KINDS } from "@/db/schema";
import { getLan } from "@/lib/lans";
import { PACKING_ITEMS } from "@/lib/gear";
import { canViewLan, isLanManager, requireLanManager, requireUser } from "@/lib/session";

const { attendance, travelPost, travelSpot, gearNeed, gearPledge, gearPacked } = schema;

const refresh = (lanId: string) => revalidatePath(`/lans/${lanId}`);

/** Signed-in clan member who answered coming, unsure or waitlist for this LAN. */
async function requireAttendee(lanId: string) {
  const me = await requireUser();
  if (!getLan(lanId) || !canViewLan(me, lanId)) throw new Error("LAN not found");
  const a = db
    .select({ status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id)))
    .get();
  if (!a || a.status === "declined") throw new Error("Sign up for the LAN first");
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
      throw new Error("More people have joined than that. Remove someone first.");
    db.update(travelPost)
      .set({ town: v.town, places: v.places, whenText: v.whenText, note: v.note })
      .where(eq(travelPost.id, postId))
      .run();
  } else {
    db.insert(travelPost).values({ lanId, userId: me.id, ...v }).run();
  }
  refresh(lanId);
}

/** The author or an orga removes a post (its passengers/guests are released). */
export async function deleteTravelPost(postId: string) {
  const me = await requireUser();
  const p = mustGetPost(postId);
  if (p.userId !== me.id && !isLanManager(me, p.lanId)) throw new Error("Not your post");
  db.delete(travelPost).where(eq(travelPost.id, postId)).run();
  refresh(p.lanId);
}

/** Adds `userId` to an offer, and drops their open request of the same kind (it's solved). */
function addSpot(p: typeof travelPost.$inferSelect, userId: string) {
  if (p.mode !== "offer") throw new Error("You can only join offers");
  if (p.userId === userId) throw new Error("That's your own offer");
  db.transaction((tx) => {
    const taken = tx.select({ id: travelSpot.id }).from(travelSpot).where(eq(travelSpot.postId, p.id)).all().length;
    if (taken >= p.places) throw new Error("No free places left");
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
  addSpot(p, me.id);
  refresh(p.lanId);
}

/** Leave an offer you joined, or (as its author or an orga) remove someone from it. */
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
    throw new Error("Pick one of your own offers");
  addSpot(offer, req.userId);
  refresh(req.lanId);
}

// ---------------- Gear ----------------

const needInput = z.object({
  name: z.string().trim().min(1, "Enter an item").max(40),
  qty: z.coerce.number().int().min(1).max(99),
  note: z.string().trim().max(100).default(""),
});

/** Orgas: add or edit a piece of shared gear the group needs. */
export async function saveGearNeed(lanId: string, input: z.input<typeof needInput>, needId?: string) {
  await requireLanManager(lanId);
  const v = needInput.parse(input);
  if (needId) db.update(gearNeed).set(v).where(and(eq(gearNeed.id, needId), eq(gearNeed.lanId, lanId))).run();
  else db.insert(gearNeed).values({ lanId, ...v }).run();
  refresh(lanId);
}

export async function deleteGearNeed(needId: string) {
  const n = db.select().from(gearNeed).where(eq(gearNeed.id, needId)).get();
  if (!n) return;
  await requireLanManager(n.lanId);
  db.delete(gearNeed).where(eq(gearNeed.id, needId)).run();
  refresh(n.lanId);
}

/** Orgas: copy the shared-gear list from an earlier event (usually the last one of the same LAN type). */
export async function copyGearNeeds(lanId: string, fromLanId: string) {
  await requireLanManager(lanId);
  const from = getLan(fromLanId);
  const to = getLan(lanId);
  if (!from || !to || from.clanId !== to.clanId) throw new Error("LAN not found");
  const have = new Set(
    db.select().from(gearNeed).where(eq(gearNeed.lanId, lanId)).all().map((n) => n.name.toLowerCase()),
  );
  const rows = db
    .select()
    .from(gearNeed)
    .where(eq(gearNeed.lanId, fromLanId))
    .all()
    .filter((n) => !have.has(n.name.toLowerCase()));
  if (rows.length) db.insert(gearNeed).values(rows.map((n) => ({ lanId, name: n.name, qty: n.qty, note: n.note }))).run();
  refresh(lanId);
}

/** How many of a shared item the member brings. 0 removes the pledge. */
export async function setGearPledge(needId: string, qty: number) {
  const n = db.select().from(gearNeed).where(eq(gearNeed.id, needId)).get();
  if (!n) throw new Error("Not found");
  const me = await requireAttendee(n.lanId);
  const q = z.number().int().min(0).max(99).parse(qty);
  db.transaction((tx) => {
    tx.delete(gearPledge).where(and(eq(gearPledge.needId, needId), eq(gearPledge.userId, me.id))).run();
    if (q > 0) tx.insert(gearPledge).values({ lanId: n.lanId, userId: me.id, needId, qty: q }).run();
  });
  refresh(n.lanId);
}

/** Something extra a member brings for the group that isn't on the list (beamer, coffee machine, ...). */
export async function addGearExtra(lanId: string, name: string, qty: number) {
  const me = await requireAttendee(lanId);
  const v = needInput.pick({ name: true, qty: true }).parse({ name, qty });
  db.insert(gearPledge).values({ lanId, userId: me.id, needId: null, ...v }).run();
  refresh(lanId);
}

export async function deleteGearPledge(pledgeId: string) {
  const me = await requireUser();
  const p = db.select().from(gearPledge).where(eq(gearPledge.id, pledgeId)).get();
  if (!p) return;
  if (p.userId !== me.id && !isLanManager(me, p.lanId)) throw new Error("Not yours");
  db.delete(gearPledge).where(eq(gearPledge.id, pledgeId)).run();
  refresh(p.lanId);
}

/** Tick or untick an item on the member's own packing list. */
export async function setPacked(lanId: string, item: string, packed: boolean) {
  const me = await requireUser();
  if (!canViewLan(me, lanId)) throw new Error("LAN not found");
  if (!PACKING_ITEMS.some((p) => p.id === item)) throw new Error("Unknown item");
  if (packed) db.insert(gearPacked).values({ lanId, userId: me.id, item }).onConflictDoNothing().run();
  else
    db.delete(gearPacked)
      .where(and(eq(gearPacked.lanId, lanId), eq(gearPacked.userId, me.id), eq(gearPacked.item, item)))
      .run();
  refresh(lanId);
}
