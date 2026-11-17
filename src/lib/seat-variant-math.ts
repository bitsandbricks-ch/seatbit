import type { PlanMove, PlanSeat } from "./seating";

/**
 * Seat plan variants as plain data: a variant is "seat label -> user id". Pure functions,
 * no DB access, so they are easy to test (see seat-variant-math.test.ts).
 */

export type Arrangement = Record<string, string>;

/** At most this many variants per event: enough to compare, few enough to keep the list short. */
export const MAX_VARIANTS = 20;
export const MAX_VARIANT_NAME = 60;

/** Who sits where right now, as a variant stores it. */
export function arrangementOf(seats: Pick<PlanSeat, "label" | "userId">[]): Arrangement {
  const out: Arrangement = {};
  for (const s of seats) if (s.userId) out[s.label] = s.userId;
  return out;
}

/**
 * The event's seats with a variant's people on them. Seats the variant doesn't name are empty.
 * Left out: labels that no longer exist, people who aren't coming any more (`coming`), and anyone
 * a variant names twice after a hand edit (first seat in grid order wins).
 */
export function seatsWithVariant<S extends PlanSeat>(seats: S[], arrangement: Arrangement, coming: Set<string>): S[] {
  const placed = new Set<string>();
  return [...seats]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map((s) => {
      const u = arrangement[s.label];
      if (!u || !coming.has(u) || placed.has(u)) return { ...s, userId: null };
      placed.add(u);
      return { ...s, userId: u };
    });
}

/** Who sits somewhere else (or nowhere) in `after` than in `before`, as the plan history logs it. */
export function movesBetween(before: Pick<PlanSeat, "label" | "userId">[], after: Pick<PlanSeat, "label" | "userId">[]): PlanMove[] {
  const was = new Map(before.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const now = new Map(after.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const people = [...new Set([...was.keys(), ...now.keys()])];
  return people
    .filter((u) => was.get(u) !== now.get(u))
    .map((u) => ({ u, from: was.get(u) ?? null, to: now.get(u) ?? null }))
    .sort((a, b) => (a.to ?? a.from ?? "").localeCompare(b.to ?? b.from ?? "", undefined, { numeric: true }));
}

/** A tidy name, or "" when nothing usable was typed. */
export const cleanVariantName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_VARIANT_NAME);

/** "Variant 3": the first number no other variant uses yet. */
export function nextVariantName(taken: string[], word: string) {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  let n = taken.length + 1;
  while (used.has(`${word} ${n}`.toLowerCase())) n++;
  return `${word} ${n}`;
}
