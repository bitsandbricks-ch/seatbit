import { makeT, type T } from "../i18n/translate";
import { seatRow } from "./seat-labels";
import { RANGE_KEY, rangeOf, rankWeight, withinRange, type SeatRule } from "./seat-rules";
/**
 * Seat planning with member wishes. Pure functions, no DB access.
 *
 * Each person's wishes are ranked rules; a rule counts less the further down it is
 * (rankWeight), so the top wish wins when two can't both be met.
 * "Near" means the same row and at most two seats apart (next to, or one seat
 * between). "Next to" for avoid means directly adjacent.
 */

export type PlanSeat = { id: string; row: number; col: number; label: string; userId: string | null; locked: boolean };
export type PlanPerson = {
  userId: string;
  rules: SeatRule[];
  priority: number; // higher is placed first (e.g. confirmed ticket)
  order: number; // tie-break, lower first (e.g. sign-up time)
};

const dist = (a: PlanSeat, b: PlanSeat) => (a.row === b.row ? Math.abs(a.col - b.col) : Infinity);

/** A seat is at the edge when it has no seat directly to its left or right. */
function edgeSet(seats: PlanSeat[]) {
  const pos = new Set(seats.map((s) => `${s.row}:${s.col}`));
  return new Set(seats.filter((s) => !pos.has(`${s.row}:${s.col - 1}`) || !pos.has(`${s.row}:${s.col + 1}`)).map((s) => s.id));
}

/** a's rule of `kind` about b with its weight, or undefined. */
function ruleAbout(a: PlanPerson | undefined, kind: "near" | "avoid", bId: string) {
  if (!a) return undefined;
  const i = a.rules.findIndex((r) => r.kind === kind && r.userId === bId);
  return i === -1 ? undefined : { rule: a.rules[i], w: rankWeight(i) };
}

/** Points for sitting `d` apart under a near rule: closer is better, nothing outside its range. */
function nearPoints(d: number, rule: SeatRule) {
  if (rule.kind !== "near" || !withinRange(d, rangeOf(rule))) return 0;
  return d === 1 ? 10 : d === 2 ? 6 : 4;
}

/** The stronger of the two people's near wishes about each other, for seats `d` apart. */
function nearScore(a: PlanPerson, bId: string, b: PlanPerson | undefined, d: number) {
  const mine = ruleAbout(a, "near", bId);
  const theirs = ruleAbout(b, "near", a.userId);
  return Math.max(mine ? mine.w * nearPoints(d, mine.rule) : 0, theirs ? theirs.w * nearPoints(d, theirs.rule) : 0);
}
/** The stronger of the two people's "not near" wishes that seats `d` apart break. */
function avoidWeight(a: PlanPerson, bId: string, b: PlanPerson | undefined, d: number) {
  const hit = (x: ReturnType<typeof ruleAbout>) => (x && x.rule.kind === "avoid" && withinRange(d, rangeOf(x.rule)) ? x.w : 0);
  return Math.max(hit(ruleAbout(a, "avoid", bId)), hit(ruleAbout(b, "avoid", a.userId)));
}

const nearIds = (p: PlanPerson) => p.rules.flatMap((r) => (r.kind === "near" ? [r.userId] : []));

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
  for (const p of everyone) for (const n of nearIds(p)) if (byUser.has(n)) parent.set(find(p.userId), find(n));
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
        if (!Number.isFinite(d)) continue;
        const other = byUser.get(uid);
        score += nearScore(p, uid, other, d);
        score -= avoidWeight(p, uid, other, d) * 12;
      }
      p.rules.forEach((r, i) => {
        const w = rankWeight(i);
        if (r.kind === "seat" && s.label.toUpperCase() === r.seat) score += 12 * w;
        if (r.kind === "row" && seatRow(s) === r.row) score += 8 * w;
        if (r.kind === "edge") score += (edges.has(s.id) ? 6 : -2) * w;
        if (r.kind === "middle") score += (edges.has(s.id) ? -6 : 2) * w;
      });
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

/** `ok` is null while it can't be checked yet (you or the other person has no seat). */
export type WishItem = { text: string; ok: boolean | null; rank: number };
/** `score`: share of the checkable wishes met, weighted by rank (0..1); null when none can be checked yet. */
export type WishCheck = { userId: string; items: WishItem[]; score: number | null };

/** Weighted share of met wishes; a top wish counts more than one further down. */
export function wishScore(items: WishItem[]): number | null {
  let met = 0;
  let all = 0;
  for (const i of items) {
    if (i.ok === null) continue;
    const w = rankWeight(i.rank - 1);
    all += w;
    if (i.ok) met += w;
  }
  return all ? met / all : null;
}

/** Everyone's scores averaged, each person counting once; null when nothing can be checked yet. */
export function overallScore(checks: WishCheck[]): number | null {
  const scores = checks.flatMap((c) => (c.score === null ? [] : [c.score]));
  return scores.length ? scores.reduce((n, x) => n + x, 0) / scores.length : null;
}

/** Which wishes the current seating meets, per person with wishes, in their ranked order. */
export function checkWishes(seats: PlanSeat[], everyone: PlanPerson[], nameOf: (id: string) => string, t: T = makeT("en")) {
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s]));
  const edges = edgeSet(seats);
  const out: WishCheck[] = [];
  for (const p of everyone) {
    if (!p.rules.length) continue;
    const mine = seatOf.get(p.userId);
    const items: WishItem[] = p.rules.map((r, i) => {
      const item = (text: string, ok: (s: PlanSeat) => boolean | null): WishItem => ({ text, ok: mine ? ok(mine) : null, rank: i + 1 });
      switch (r.kind) {
        case "near":
        case "avoid": {
          const o = seatOf.get(r.userId);
          const name = nameOf(r.userId);
          return r.kind === "near"
            ? item(t(`wishCheck.near.${RANGE_KEY[rangeOf(r)]}`, { name }), (m) => (o ? withinRange(dist(m, o), rangeOf(r)) : null))
            : item(t(`wishCheck.avoid.${RANGE_KEY[rangeOf(r)]}`, { name }), (m) => (o ? !withinRange(dist(m, o), rangeOf(r)) : null));
        }
        case "seat":
          return item(t("wishCheck.seat", { seat: r.seat }), (m) => m.label.toUpperCase() === r.seat);
        case "row":
          return item(t("wishCheck.row", { row: r.row }), (m) => seatRow(m) === r.row);
        case "edge":
          return item(t("wishCheck.edge"), (m) => edges.has(m.id));
        case "middle":
          return item(t("wishCheck.middle"), (m) => !edges.has(m.id));
      }
    });
    out.push({ userId: p.userId, items, score: wishScore(items) });
  }
  return out;
}
