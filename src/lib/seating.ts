import { makeT, type T } from "../i18n/translate";
import { seatRow } from "./seat-labels";
import { RANGE_KEY, rangeOf, rankWeight, withinRange, type SeatRule } from "./seat-rules";
/**
 * Seat planning with member wishes. Pure functions, no DB access.
 *
 * Each person's wishes are ranked rules; each rule counts half as much as the one
 * above it (rankWeight), so the top wish wins when two can't both be met. A person's
 * wishes add up to the same total however many they have, so a long list doesn't
 * outweigh a short one. The planner seats people one by one, then keeps moving and
 * swapping them while that makes the people involved happier overall.
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

/** A person's wish weights by rank, adding up to 1: ten wishes count as much in total as three. */
export function wishWeights(rules: SeatRule[]): number[] {
  const raw = rules.map((_, i) => rankWeight(i));
  const sum = raw.reduce((n, x) => n + x, 0);
  return raw.map((w) => w / sum);
}
const weightCache = new WeakMap<PlanPerson, number[]>();
const weightsOf = (p: PlanPerson) => {
  let w = weightCache.get(p);
  if (!w) weightCache.set(p, (w = wishWeights(p.rules)));
  return w;
};

/** a's rule of `kind` about b with its weight, or undefined. */
function ruleAbout(a: PlanPerson | undefined, kind: "near" | "avoid", bId: string) {
  if (!a) return undefined;
  const i = a.rules.findIndex((r) => r.kind === kind && r.userId === bId);
  return i === -1 ? undefined : { rule: a.rules[i], w: weightsOf(a)[i] };
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
        const w = weightsOf(p)[i];
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
  improve(seats, occupant, new Set(result.keys()), byUser, edges);
  for (const [seatId, userId] of occupant) if (result.has(userId)) result.set(userId, seatId);
  return result;
}

/**
 * How well one rule is met from `mine` (0..1), or null when it can't be told (the other
 * person has no seat). Near wishes that miss get a little credit for being close, so the
 * improvement pass can tell "almost" from "far away".
 */
function ruleMet(r: SeatRule, mine: PlanSeat, seatOf: Map<string, PlanSeat>, edges: Set<string>): number | null {
  switch (r.kind) {
    case "near":
    case "avoid": {
      const o = seatOf.get(r.userId);
      if (!o) return null;
      const d = dist(mine, o);
      const range = rangeOf(r);
      if (r.kind === "avoid") return withinRange(d, range) ? 0 : 1;
      if (withinRange(d, range)) return 1 - 0.02 * Math.min(d - 1, 10);
      return Number.isFinite(d) && range !== "row" ? (0.3 * range) / d : 0;
    }
    case "seat":
      return mine.label.toUpperCase() === r.seat ? 1 : 0;
    case "row":
      return seatRow(mine) === r.row ? 1 : 0;
    case "edge":
      return edges.has(mine.id) ? 1 : 0;
    case "middle":
      return edges.has(mine.id) ? 0 : 1;
  }
}

/** One person's weighted satisfaction with where everyone sits (0..1). */
function happiness(p: PlanPerson, seatOf: Map<string, PlanSeat>, edges: Set<string>) {
  const mine = seatOf.get(p.userId);
  if (!mine || !p.rules.length) return 0;
  const w = weightsOf(p);
  return p.rules.reduce((n, r, i) => n + w[i] * (ruleMet(r, mine, seatOf, edges) ?? 0), 0);
}

/**
 * Local search after the greedy pass: tries moving each person placed in this run to every
 * other seat (free, or swapping with someone else placed in this run) and keeps the change
 * when the people it touches are happier together. Held seats and seats that were already
 * taken stay as they are. Stops when a full round finds nothing better.
 */
function improve(
  seats: PlanSeat[],
  occupant: Map<string, string>,
  movable: Set<string>,
  byUser: Map<string, PlanPerson>,
  edges: Set<string>,
) {
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const seatOf = new Map([...occupant].map(([sid, uid]) => [uid, seatById.get(sid)!]));
  // Whose happiness depends on where someone sits: themselves and everyone with a wish about them.
  const watchers = new Map<string, string[]>();
  for (const p of byUser.values())
    for (const r of p.rules) if (r.kind === "near" || r.kind === "avoid") watchers.set(r.userId, [...(watchers.get(r.userId) ?? []), p.userId]);
  const total = (uids: (string | undefined)[]) => {
    const all = new Set<string>();
    for (const u of uids) if (u) for (const x of [u, ...(watchers.get(u) ?? [])]) all.add(x);
    let n = 0;
    for (const u of all) {
      const p = byUser.get(u);
      if (p) n += happiness(p, seatOf, edges);
    }
    return n;
  };
  const place = (uid: string | undefined, s: PlanSeat) => {
    if (!uid) return occupant.delete(s.id);
    occupant.set(s.id, uid);
    seatOf.set(uid, s);
  };
  const open = seats.filter((s) => !s.locked);
  const order = [...movable].sort();
  for (let round = 0; round < 50; round++) {
    let better = false;
    for (const uid of order) {
      for (const s of open) {
        const from = seatOf.get(uid)!;
        if (s.id === from.id) continue;
        const other = occupant.get(s.id);
        if (other && !movable.has(other)) continue;
        const before = total([uid, other]);
        place(uid, s);
        if (other) place(other, from);
        else occupant.delete(from.id);
        if (total([uid, other]) > before + 1e-9) {
          better = true;
          continue;
        }
        place(uid, from);
        place(other, s);
      }
    }
    if (!better) break;
  }
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

/** Who a re-plan moved, by seat label (null: had or got no seat). Kept in the audit log for the plan history. */
export type PlanMove = { u: string; from: string | null; to: string | null };
/** Audit data holds flat strings only: "userId\tfrom\tto". */
export const encodeMove = (m: PlanMove) => [m.u, m.from ?? "", m.to ?? ""].join("\t");
export const decodeMoves = (v: unknown): PlanMove[] =>
  Array.isArray(v)
    ? v.flatMap((x) => {
        const [u, from, to] = typeof x === "string" ? x.split("\t") : [];
        return u ? [{ u, from: from || null, to: to || null }] : [];
      })
    : [];
