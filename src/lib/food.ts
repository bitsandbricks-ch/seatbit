import { eq, inArray } from "drizzle-orm";
import { makeT, type T } from "@/i18n/translate";
import { db, schema } from "@/db";
import type { FoodOrderStatus } from "@/db/schema";
import { getSetting } from "./settings";

const { foodOrder, foodItem } = schema;

/** Currency shown next to food prices (platform setting, default CHF). */
export const foodCurrency = () => getSetting("food.currency")?.trim() || "CHF";

/** "12.50" from 1250 cents. */
export const fmtMoney = (cents: number) => (cents / 100).toFixed(2);

/** "12.50", "12,5", "12" -> cents. Empty -> null. Bad input -> NaN (the form rejects it). */
export function parseMoney(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}

export type FoodItemView = {
  id: string;
  userId: string;
  item: string;
  qty: number;
  priceCents: number | null;
  note: string;
  paid: boolean;
};

export type FoodPersonView = {
  userId: string;
  items: FoodItemView[];
  /** Sum of the priced lines; null when nothing has a price. */
  totalCents: number | null;
  /** True when every line is ticked as paid. */
  paid: boolean;
};

export type FoodOrderView = {
  id: string;
  title: string;
  shop: string;
  menuUrl: string;
  note: string;
  closesAt: Date | null;
  status: FoodOrderStatus;
  createdBy: string | null;
  people: FoodPersonView[];
  /** What to order, same items merged: "3x Margherita". */
  summary: { item: string; qty: number }[];
  totalCents: number | null;
  paidCents: number;
  itemCount: number;
};

const lineTotal = (i: { qty: number; priceCents: number | null }) => (i.priceCents == null ? null : i.qty * i.priceCents);

const sum = (xs: (number | null)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((n, x) => n + (x ?? 0), 0) : null);

/** Food orders of a LAN with everyone's items, newest open ones first. */
export function listFoodOrders(lanId: string): FoodOrderView[] {
  const orders = db.select().from(foodOrder).where(eq(foodOrder.lanId, lanId)).all();
  const items = orders.length
    ? db.select().from(foodItem).where(inArray(foodItem.orderId, orders.map((o) => o.id))).all()
    : [];
  const rank: Record<FoodOrderStatus, number> = { open: 0, closed: 1, ordered: 2 };
  return orders
    .sort((a, b) => rank[a.status] - rank[b.status] || +b.createdAt - +a.createdAt)
    .map((o) => {
      const mine = items.filter((i) => i.orderId === o.id).sort((a, b) => +a.createdAt - +b.createdAt);
      const byUser = new Map<string, typeof mine>();
      for (const i of mine) byUser.set(i.userId, [...(byUser.get(i.userId) ?? []), i]);
      const people: FoodPersonView[] = [...byUser].map(([userId, list]) => ({
        userId,
        items: list.map((i) => ({
          id: i.id,
          userId: i.userId,
          item: i.item,
          qty: i.qty,
          priceCents: i.priceCents,
          note: i.note,
          paid: i.paid,
        })),
        totalCents: sum(list.map(lineTotal)),
        paid: list.every((i) => i.paid),
      }));
      // Same item (ignoring case and notes) merged, so the person ordering can read it out.
      const merged = new Map<string, { item: string; qty: number }>();
      for (const i of mine) {
        const label = i.note ? `${i.item} (${i.note})` : i.item;
        const key = label.toLowerCase();
        const cur = merged.get(key);
        if (cur) cur.qty += i.qty;
        else merged.set(key, { item: label, qty: i.qty });
      }
      return {
        id: o.id,
        title: o.title,
        shop: o.shop,
        menuUrl: o.menuUrl,
        note: o.note,
        closesAt: o.closesAt,
        status: o.status,
        createdBy: o.createdBy,
        people,
        summary: [...merged.values()].sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item)),
        totalCents: sum(mine.map(lineTotal)),
        paidCents: mine.filter((i) => i.paid).reduce((n, i) => n + (lineTotal(i) ?? 0), 0),
        itemCount: mine.reduce((n, i) => n + i.qty, 0),
      };
    });
}

/** Plain text of an order to read out on the phone or paste into a chat. */
export function orderText(o: FoodOrderView, names: Map<string, string> | Record<string, string>, currency: string, t: T = makeT("en")) {
  const name = (id: string) => (names instanceof Map ? names.get(id) : names[id]) ?? "?";
  const lines = [
    `${o.title}${o.shop ? ` · ${o.shop}` : ""}`,
    "",
    ...o.summary.map((s) => `${s.qty}x ${s.item}`),
    "",
    `${t("food.textItems", { count: o.itemCount })}${o.totalCents != null ? ` · ${currency} ${fmtMoney(o.totalCents)}` : ""}`,
    "",
    t("food.textPerPerson"),
    ...o.people.map(
      (p) =>
        `${name(p.userId)}: ${p.items.map((i) => `${i.qty}x ${i.item}${i.note ? ` (${i.note})` : ""}`).join(", ")}${
          p.totalCents != null ? ` · ${currency} ${fmtMoney(p.totalCents)}` : ""
        }`,
    ),
  ];
  return lines.join("\n");
}

/** Open orders past their last call are shown as closed (and refuse new items). */
export function isAcceptingItems(o: { status: FoodOrderStatus; closesAt: Date | null }, now = new Date()) {
  return o.status === "open" && (!o.closesAt || o.closesAt > now);
}
