/**
 * Seat planning with member wishes. Pure functions, no DB access.
 *
 * "Near" means the same row and at most two seats apart (next to, or one seat
 * between). "Next to" for avoid means directly adjacent.
 */

export type PlanSeat = { id: string; row: number; col: number; label: string; userId: string | null; locked: boolean };
export type PlanPerson = {
  userId: string;
  near: string[];
  avoid: string[];
  position: "any" | "edge" | "middle";
  seat: string; // preferred label, "" = none
  priority: number; // higher is placed first (e.g. confirmed ticket)
  order: number; // tie-break, lower first (e.g. sign-up time)
};

const dist = (a: PlanSeat, b: PlanSeat) => (a.row === b.row ? Math.abs(a.col - b.col) : Infinity);

/** A seat is at the edge when it has no seat directly to its left or right. */
function edgeSet(seats: PlanSeat[]) {
  const pos = new Set(seats.map((s) => `${s.row}:${s.col}`));
  return new Set(seats.filter((s) => !pos.has(`${s.row}:${s.col - 1}`) || !pos.has(`${s.row}:${s.col + 1}`)).map((s) => s.id));
}

function likes(a: PlanPerson | undefined, bId: string, b: PlanPerson | undefined) {
  return !!(a?.near.includes(bId) || (a && b?.near.includes(a.userId)));
}
function dislikes(a: PlanPerson | undefined, bId: string, b: PlanPerson | undefined) {
  return !!(a?.avoid.includes(bId) || (a && b?.avoid.includes(a.userId)));
}

/**
 * Assigns seats to `people` (who don't have one yet) among the free, not-held
 * seats, scoring each choice by the wishes. Returns userId -> seatId.
 */
export function planSeats(seats: PlanSeat[], people: PlanPerson[], everyone: PlanPerson[]) {
  const byUser = new Map(everyone.map((p) => [p.userId, p]));
  const edges = edgeSet(seats);
  const occupant = new Map(seats.filter((s) => s.userId).map((s) => [s.id, s.userId!]));
  const result = new Map<string, string>();

  // Friend groups (union-find over "near" links) so groups are placed together.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const p of everyone) for (const n of p.near) if (byUser.has(n)) parent.set(find(p.userId), find(n));
  const groupSize = new Map<string, number>();
  for (const p of people) groupSize.set(find(p.userId), (groupSize.get(find(p.userId)) ?? 0) + 1);

  const queue = [...people].sort(
    (a, b) =>
      (groupSize.get(find(b.userId)) ?? 1) - (groupSize.get(find(a.userId)) ?? 1) ||
      find(a.userId).localeCompare(find(b.userId)) ||
      b.priority - a.priority ||
      a.order - b.order,
  );
  // A group goes as far up the queue as its best-priority member.
  const placedUsers = new Set(occupant.values());

  for (const p of queue) {
    const free = seats.filter((s) => !s.locked && !occupant.has(s.id));
    if (free.length === 0) break;
    const unplacedFriends = everyone.filter(
      (o) => o.userId !== p.userId && find(o.userId) === find(p.userId) && !placedUsers.has(o.userId),
    ).length;
    let best: PlanSeat | null = null;
    let bestScore = -Infinity;
    for (const s of free) {
      let score = 0;
      for (const o of seats) {
        const uid = occupant.get(o.id);
        if (!uid || o.id === s.id) continue;
        const d = dist(s, o);
        if (d > 2) continue;
        const other = byUser.get(uid);
        if (likes(p, uid, other)) score += d === 1 ? 10 : 5;
        if (d === 1 && dislikes(p, uid, other)) score -= 25;
      }
      if (p.seat && s.label.toUpperCase() === p.seat.toUpperCase()) score += 15;
      if (p.position === "edge") score += edges.has(s.id) ? 4 : -2;
      if (p.position === "middle") score += edges.has(s.id) ? -4 : 2;
      // Keep room next to me for friends still to come.
      if (unplacedFriends > 0) {
        const room = free.filter((f) => f.id !== s.id && dist(f, s) <= Math.min(unplacedFriends, 2)).length;
        score += room * 1.5;
      }
      score -= s.row * 0.01 + s.col * 0.001; // stable: front-left first
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (!best) break;
    occupant.set(best.id, p.userId);
    placedUsers.add(p.userId);
    result.set(p.userId, best.id);
  }
  return result;
}

export type WishCheck = { userId: string; ok: string[]; missed: string[] };

/** Which wishes the current seating meets, per person with wishes. */
export function checkWishes(seats: PlanSeat[], everyone: PlanPerson[], nameOf: (id: string) => string) {
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s]));
  const edges = edgeSet(seats);
  const out: WishCheck[] = [];
  for (const p of everyone) {
    const mine = seatOf.get(p.userId);
    const ok: string[] = [];
    const missed: string[] = [];
    if (!mine) continue;
    for (const n of p.near) {
      const o = seatOf.get(n);
      if (!o) continue;
      (dist(mine, o) <= 2 ? ok : missed).push(`near ${nameOf(n)}`);
    }
    for (const a of p.avoid) {
      const o = seatOf.get(a);
      if (!o) continue;
      (dist(mine, o) === 1 ? missed : ok).push(`not next to ${nameOf(a)}`);
    }
    if (p.position === "edge") (edges.has(mine.id) ? ok : missed).push("at the edge");
    if (p.position === "middle") (edges.has(mine.id) ? missed : ok).push("in the middle");
    if (p.seat) (mine.label.toUpperCase() === p.seat.toUpperCase() ? ok : missed).push(`seat ${p.seat}`);
    if (ok.length || missed.length) out.push({ userId: p.userId, ok, missed });
  }
  return out;
}
