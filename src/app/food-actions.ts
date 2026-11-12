"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { FoodOrderStatus, User } from "@/db/schema";
import { fmtTime } from "@/lib/format";
import { isAcceptingItems, parseMoney } from "@/lib/food";
import { getDisplayNames, getLan } from "@/lib/lans";
import { appUrl } from "@/lib/mail";
import { notify, notifyLater } from "@/lib/notify";
import { canViewLan, isLanManager, requireUser } from "@/lib/session";

const { foodOrder, foodItem, attendance, user } = schema;

const MAX_ORDERS = 20;
const MAX_ITEMS_PER_PERSON = 15;

const foodPath = (lanId: string) => revalidatePath(`/lans/${lanId}`);

function myAttendance(lanId: string, userId: string) {
  return db
    .select()
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId)))
    .get();
}

/** Everyone who isn't "not coming" may order food; orgas always. */
function canOrder(me: User, lanId: string) {
  if (isLanManager(me, lanId)) return true;
  if (!canViewLan(me, lanId)) return false;
  const a = myAttendance(lanId, me.id);
  return !!a && a.status !== "declined";
}

function getOrder(orderId: string) {
  const o = db.select().from(foodOrder).where(eq(foodOrder.id, orderId)).get();
  if (!o) throw new Error("This food order is gone.");
  return o;
}

/** Whoever started an order runs it (collects the money); orgas can too. */
function canRunOrder(me: User, o: { lanId: string; createdBy: string | null }) {
  return o.createdBy === me.id || isLanManager(me, o.lanId);
}

const orderInput = z.object({
  title: z.string().trim().min(1, "Give it a name").max(60),
  shop: z.string().trim().max(60),
  menuUrl: z.union([z.literal(""), z.url().max(500)]),
  note: z.string().trim().max(300),
  closesAt: z
    .string()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !isNaN(d.getTime()), "Invalid time"),
  announce: z.boolean(),
});

/** Starts a food order ("Pizza Saturday 19:00"). Anyone coming can, and may DM everyone coming about it. */
export async function createFoodOrder(lanId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireUser();
  const l = getLan(lanId);
  if (!l) return { error: "LAN not found" };
  if (!canOrder(me, lanId)) return { error: "Only people coming to this LAN can start a food order." };
  if (l.cancelledAt) return { error: "This event is cancelled." };
  const parsed = orderInput.safeParse({
    title: formData.get("title") ?? "",
    shop: formData.get("shop") ?? "",
    menuUrl: String(formData.get("menuUrl") ?? "").trim(),
    note: formData.get("note") ?? "",
    closesAt: String(formData.get("closesAt") ?? ""),
    announce: formData.get("announce") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  if (db.select().from(foodOrder).where(eq(foodOrder.lanId, lanId)).all().length >= MAX_ORDERS)
    return { error: `This LAN already has ${MAX_ORDERS} food orders. Delete an old one first.` };
  const { announce, ...values } = parsed.data;
  const o = db.insert(foodOrder).values({ lanId, ...values, createdBy: me.id }).returning().get();

  if (announce && l.publishedAt) {
    const names = await getDisplayNames(lanId, [me.id]);
    const going = db
      .select({ u: user })
      .from(attendance)
      .innerJoin(user, eq(user.id, attendance.userId))
      .where(and(eq(attendance.lanId, lanId), eq(attendance.status, "going"), ne(user.id, me.id)))
      .all();
    const url = `${appUrl}/lans/${lanId}?tab=food`;
    notifyLater(async () => {
      for (const { u } of going)
        await notify(u, {
          kind: "food_order",
          subject: `${o.title}: add your order`,
          text: `${names.get(me.id)} is collecting a food order at ${l.name}: ${o.title}${o.shop ? ` from ${o.shop}` : ""}.${
            o.closesAt ? ` Last call ${fmtTime(o.closesAt)}.` : ""
          }${o.note ? `\n\n${o.note}` : ""}\n\nAdd what you want in Seatbit.`,
          url,
          // Food runs are small and happen at the LAN: a DM, never a mail.
          dmOnly: true,
        });
    });
  }
  foodPath(lanId);
  return {};
}

/** Close (no new items), mark as ordered, or reopen. */
export async function setFoodOrderStatus(orderId: string, status: FoodOrderStatus) {
  const me = await requireUser();
  const o = getOrder(orderId);
  if (!canRunOrder(me, o)) throw new Error("Only who started this order or an orga can change it.");
  // Reopening an order whose last call passed clears the last call, otherwise it would stay closed.
  const reopenLate = status === "open" && o.closesAt && o.closesAt <= new Date();
  db.update(foodOrder)
    .set({ status, ...(reopenLate ? { closesAt: null } : {}) })
    .where(eq(foodOrder.id, orderId))
    .run();
  foodPath(o.lanId);
}

export async function deleteFoodOrder(orderId: string) {
  const me = await requireUser();
  const o = getOrder(orderId);
  if (!canRunOrder(me, o)) throw new Error("Only who started this order or an orga can delete it.");
  db.delete(foodOrder).where(eq(foodOrder.id, orderId)).run();
  foodPath(o.lanId);
}

const itemInput = z.object({
  item: z.string().trim().min(1, "What do you want?").max(80),
  qty: z.coerce.number().int().min(1).max(20),
  price: z
    .string()
    .transform(parseMoney)
    .refine((c) => c === null || Number.isFinite(c), "Price like 14.50"),
  note: z.string().trim().max(80),
});

/** Adds a line to an open order ("2x Margherita, extra cheese"). */
export async function addFoodItem(orderId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireUser();
  const o = getOrder(orderId);
  if (!canOrder(me, o.lanId)) return { error: "Only people coming to this LAN can order." };
  // The one running the order can still add late items (someone shouted their order across the room).
  if (!isAcceptingItems(o) && !canRunOrder(me, o)) return { error: "This order is closed." };
  const parsed = itemInput.safeParse({
    item: formData.get("item") ?? "",
    qty: formData.get("qty") || "1",
    price: String(formData.get("price") ?? ""),
    note: formData.get("note") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join(", ") };
  const mine = db
    .select()
    .from(foodItem)
    .where(and(eq(foodItem.orderId, orderId), eq(foodItem.userId, me.id)))
    .all();
  if (mine.length >= MAX_ITEMS_PER_PERSON) return { error: "That's a lot of food. Ask whoever orders to add the rest." };
  const { price, ...rest } = parsed.data;
  db.insert(foodItem).values({ orderId, userId: me.id, ...rest, priceCents: price }).run();
  foodPath(o.lanId);
  return {};
}

/** Removes a line: your own while the order is open, any line for who runs the order. */
export async function removeFoodItem(itemId: string) {
  const me = await requireUser();
  const i = db.select().from(foodItem).where(eq(foodItem.id, itemId)).get();
  if (!i) return;
  const o = getOrder(i.orderId);
  const own = i.userId === me.id && isAcceptingItems(o);
  if (!own && !canRunOrder(me, o)) throw new Error("This order is closed. Ask whoever runs it.");
  db.delete(foodItem).where(eq(foodItem.id, itemId)).run();
  foodPath(o.lanId);
}

/** Ticks (or unticks) that a person paid for everything they ordered. */
export async function setFoodPaid(orderId: string, userId: string, paid: boolean) {
  const me = await requireUser();
  const o = getOrder(orderId);
  if (!canRunOrder(me, o)) throw new Error("Only who runs this order can tick payments.");
  db.update(foodItem)
    .set({ paid })
    .where(and(eq(foodItem.orderId, orderId), eq(foodItem.userId, userId)))
    .run();
  foodPath(o.lanId);
}
