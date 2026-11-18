import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { auditLan } from "./audit";
import { runJob } from "./jobs";
import { lanChanged } from "./live";
import { reportError } from "./ops";
import { planArrangement } from "./seat-variants";
import { getNumberSetting } from "./settings";

/**
 * The exact seat search ("thorough" in the code): runs in the background for up to a few minutes
 * (platform setting "seats.thoroughMinutes"), proves the best plan where it can (seat-milp.ts) and
 * saves it as a seat plan variant, marked proven or not, so the leads look at it before anything
 * changes for members. One search per event at a time.
 * Kept in memory: a restart ends a running search without a result.
 */

export type SeatSearch = { lanId: string; by: string; name: string; startedAt: number; until: number };

// On globalThis: server actions and route handlers get their own module copies.
const g = globalThis as unknown as { __seatbitSeatSearch?: Map<string, SeatSearch & { done: Promise<void> }> };
const running = () => (g.__seatbitSeatSearch ??= new Map());

export const DEFAULT_THOROUGH_MINUTES = 5;
export const thoroughMinutes = () => getNumberSetting("seats.thoroughMinutes") || DEFAULT_THOROUGH_MINUTES;

/** The search running for this event, or null. */
export function runningSeatSearch(lanId: string): SeatSearch | null {
  const s = running().get(lanId);
  return s ? { lanId: s.lanId, by: s.by, name: s.name, startedAt: s.startedAt, until: s.until } : null;
}

/** Resolves once this event's search has saved its variant (or failed); for tests. */
export const seatSearchDone = (lanId: string) => running().get(lanId)?.done ?? Promise.resolve();

/** Starts the search unless one runs already, and returns it. */
export function startSeatSearch(lanId: string, actorId: string, name: string): SeatSearch {
  const now = runningSeatSearch(lanId);
  if (now) return now;
  const startedAt = Date.now();
  const search: SeatSearch = { lanId, by: actorId, name, startedAt, until: startedAt + thoroughMinutes() * 60_000 };
  const done = runJob("seat-search", async () => {
    try {
      const report: { proven?: boolean } = {};
      const seats = await planArrangement(lanId, "thorough", search.until, report);
      const proven = report.proven ?? false;
      const l = db.select().from(schema.lan).where(eq(schema.lan.id, lanId)).get();
      if (!l) return;
      db.insert(schema.seatVariant).values({ lanId, name, seats, createdBy: actorId, proven }).run();
      auditLan(l, actorId, "seat.variantSave", { data: { name, from: "thorough", proven, count: Object.keys(seats).length } });
    } finally {
      running().delete(lanId);
      // The leads' open Manage page shows the new variant.
      lanChanged(lanId);
    }
  }).catch((e) => reportError("seat-search", e));
  running().set(lanId, { ...search, done });
  return search;
}
