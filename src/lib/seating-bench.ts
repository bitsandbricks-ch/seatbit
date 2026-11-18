import { checkWishes, type PlanPerson, type PlanSeat } from "./seating";
import { normalizeRules, type SeatRule } from "./seat-rules";

/**
 * Made-up events where every wish can be met: people are put on random seats first and then
 * only wish for what that plan gives them. If the planner misses a wish here, it's the search
 * that failed, not the wishes. Used by the unit tests and `npm run bench:seats`.
 */

/** Small seeded random numbers (mulberry32). */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `rows`: seats per row. `maxWishes`: each person gets 0 to this many wishes. */
export function plantedEvent(
  seed: number,
  rows: number[],
  maxWishes = 3,
  nearRange = 4,
) {
  const rand = random(seed * 31 + 7);
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
  const seats: PlanSeat[] = rows.flatMap((len, row) =>
    Array.from({ length: len }, (_, col) => ({
      id: `s${row}-${col}`,
      row,
      col,
      label: `${String.fromCharCode(65 + row)}${col + 1}`,
      userId: null,
      locked: false,
    })),
  );
  const count = Math.max(2, Math.round(seats.length * (0.75 + rand() * 0.25)));
  const shuffled = seats
    .map((s) => ({ s, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
  const ids = shuffled.slice(0, count).map((_, i) => `u${i}`);
  const at = new Map(ids.map((u, i) => [u, shuffled[i]]));
  const apart = (a: PlanSeat, b: PlanSeat) =>
    a.row === b.row ? Math.abs(a.col - b.col) : Infinity;
  const isEdge = (s: PlanSeat) =>
    !seats.some(
      (o) => o.row === s.row && Math.abs(o.col - s.col) === 1 && o.col < s.col,
    ) || !seats.some((o) => o.row === s.row && o.col === s.col + 1);
  const people: PlanPerson[] = ids.map((u) => {
    const me = at.get(u)!;
    const others = ids.filter((o) => o !== u);
    const rules: SeatRule[] = [];
    const n = Math.floor(rand() * (maxWishes + 1));
    for (let i = 0; i < n; i++) {
      const roll = rand();
      if (roll < 0.25) {
        const next = others.filter((o) => apart(at.get(o)!, me) === 1);
        if (next.length) rules.push({ kind: "next", userId: pick(next) });
      } else if (roll < 0.6) {
        const near = others.filter((o) => apart(at.get(o)!, me) <= nearRange);
        if (near.length) rules.push({ kind: "near", userId: pick(near) });
      } else if (roll < 0.75) {
        rules.push({
          kind: "avoid",
          userId: pick(others.filter((o) => apart(at.get(o)!, me) !== 1)),
        });
      } else if (roll < 0.85)
        rules.push({ kind: isEdge(me) ? "edge" : "middle" });
      else if (roll < 0.95 && rows.length > 1)
        rules.push({ kind: "row", row: me.label[0] });
      else if (rand() < 0.3) rules.push({ kind: "seat", seat: me.label });
    }
    return {
      userId: u,
      rules: normalizeRules(rules, u),
      priority: 0,
      order: 0,
    };
  });
  return { seats, people };
}

/** The wishes `plan` misses, as "who: wish". */
export function missedWishes(
  seats: PlanSeat[],
  people: PlanPerson[],
  plan: Map<string, string>,
  nearRange = 4,
) {
  const bySeat = new Map([...plan].map(([u, s]) => [s, u]));
  const placed = seats.map((s) => ({
    ...s,
    userId: bySeat.get(s.id) ?? s.userId,
  }));
  return checkWishes(placed, people, (id) => id, undefined, {
    nearRange,
  }).flatMap((c) =>
    c.items.filter((i) => i.ok === false).map((i) => `${c.userId}: ${i.text}`),
  );
}
