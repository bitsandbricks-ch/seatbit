import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { getLan } from "./lans";

/** The personal packing list every member gets for a LAN. */
export const PACKING_ITEMS = [
  { id: "pc", label: "PC or laptop" },
  { id: "screen", label: "Screen" },
  { id: "power", label: "Power cables" },
  { id: "keyboard", label: "Keyboard" },
  { id: "mouse", label: "Mouse and mouse pad" },
  { id: "headset", label: "Headset" },
  { id: "lancable", label: "LAN cable" },
  { id: "powerstrip", label: "Power strip" },
  { id: "ticket", label: "Ticket and ID" },
  { id: "sleep", label: "Sleeping bag and mat" },
  { id: "toiletries", label: "Toiletries" },
  { id: "snacks", label: "Snacks and drinks" },
] as const;

/** The most recent other event of the clan that has a shared-gear list, preferring the same LAN type. */
export function lastGearSource(lanId: string) {
  const l = getLan(lanId);
  if (!l?.clanId) return undefined;
  const lanIds = db
    .selectDistinct({ id: schema.gearNeed.lanId })
    .from(schema.gearNeed)
    .where(ne(schema.gearNeed.lanId, lanId))
    .all()
    .map((r) => r.id);
  if (!lanIds.length) return undefined;
  return db
    .select()
    .from(schema.lan)
    .where(and(inArray(schema.lan.id, lanIds), eq(schema.lan.clanId, l.clanId)))
    .all()
    .sort((a, b) => Number(b.typeId === l.typeId) - Number(a.typeId === l.typeId) || +b.startsAt - +a.startsAt)[0];
}

/** Suggestions offered to orgas when the shared-gear list is empty. */
export const GEAR_SUGGESTIONS = [
  { name: "Network switch", qty: 1 },
  { name: "Power strip", qty: 4 },
  { name: "Long LAN cable (uplink)", qty: 1 },
  { name: "Extension reel", qty: 1 },
];
