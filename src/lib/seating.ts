import { makeT, type T } from "../i18n/translate";
import { seatRow } from "./seat-labels";
import { DEFAULT_NEAR_RANGE, isRanked, wishWeights, type SeatRule } from "./seat-rules";
/**
 * Seat planning with member wishes. Pure functions, no DB access.
 *
 * Each person has ranked wishes; each counts half as much as the one above it,
 * so the top wish wins when two can't both be met. A person's ranked wishes add up to the
 * same total however many they have, so a long list doesn't outweigh a short one.
 * "Right next to" pulls a bit harder, and every "not right next to" counts as much as all
 * ranked wishes together (see wishWeights). The planner seats people one by one, then
 * keeps moving and swapping them while that makes the people involved happier overall.
 */

export type PlanSeat = { id: string; row: number; col: number; label: string; userId: string | null; locked: boolean };
export type PlanPerson = {
  userId: string;
  rules: SeatRule[];
  priority: number; // higher is placed first (e.g. confirmed ticket)
  order: number; // tie-break, lower first (e.g. sign-up time)
};
/**
 * Event settings the planner needs. `nearRange`: how many seats apart still count as "near".
 * `stay`: where people sat before a re-plan (userId -> seatId); they keep that seat unless moving
 * them meets a wish, so changing one wish doesn't shuffle everyone else around.
 */
export type PlanOptions = { nearRange?: number; stay?: Map<string, string> };

/** What the scoring needs besides who sits where. */
type Ctx = { edges: Set<string>; range: number; stay: Map<string, string> | undefined };
/**
 * Worth of keeping one's old seat: far below any wish that matters (a fifth-ranked wish counts
 * about 0.03), so it only decides between plans that meet the wishes equally well.
 */
const STAY = 1e-4;

const dist = (a: PlanSeat, b: PlanSeat) => (a.row === b.row ? Math.abs(a.col - b.col) : Infinity);

/** A seat is at the edge when it has no seat directly to its left or right. */
function edgeSet(seats: PlanSeat[]) {
  const pos = new Set(seats.map((s) => `${s.row}:${s.col}`));
  return new Set(seats.filter((s) => !pos.has(`${s.row}:${s.col - 1}`) || !pos.has(`${s.row}:${s.col + 1}`)).map((s) => s.id));
}

export { wishWeights };
const weightCache = new WeakMap<PlanPerson, number[]>();
const weightsOf = (p: PlanPerson) => {
  let w = weightCache.get(p);
  if (!w) weightCache.set(p, (w = wishWeights(p.rules)));
  return w;
};

type PersonKind = "next" | "near" | "avoid";
/** a's rule about b with its weight, or undefined. */
function ruleAbout(a: PlanPerson | undefined, bId: string) {
  if (!a) return undefined;
  const i = a.rules.findIndex((r) => (r.kind === "next" || r.kind === "near" || r.kind === "avoid") && r.userId === bId);
  return i === -1 ? undefined : { kind: a.rules[i].kind as PersonKind, w: weightsOf(a)[i] };
}

/**
 * Greedy points for sitting `d` apart under a person wish: right next to only counts when
 * adjacent (and counts most); near counts within the range, more the closer.
 */
function pullPoints(kind: PersonKind, d: number, range: number) {
  if (kind === "next") return d === 1 ? 14 : 0;
  if (kind === "near") return d <= range ? 4 + 6 / d : 0;
  return 0;
}

/** The stronger of the two people's wishes to sit together, for seats `d` apart. */
function pullScore(a: PlanPerson, bId: string, b: PlanPerson | undefined, d: number, range: number) {
  const pts = (x: ReturnType<typeof ruleAbout>) => (x ? x.w * pullPoints(x.kind, d, range) : 0);
  return Math.max(pts(ruleAbout(a, bId)), pts(b && ruleAbout(b, a.userId)));
}
/** The stronger of the two people's "not right next to" wishes that seats `d` apart break. */
function avoidWeight(a: PlanPerson, bId: string, b: PlanPerson | undefined, d: number) {
  if (d !== 1) return 0;
  const hit = (x: ReturnType<typeof ruleAbout>) => (x?.kind === "avoid" ? x.w : 0);
  return Math.max(hit(ruleAbout(a, bId)), hit(b && ruleAbout(b, a.userId)));
}

const friendIds = (p: PlanPerson) => p.rules.flatMap((r) => (r.kind === "near" || r.kind === "next" ? [r.userId] : []));

/**
 * Assigns seats to `people` (who don't have one yet) among the free, not-held
 * seats, scoring each choice by the wishes. Returns userId -> seatId.
 */
export function planSeats(seats: PlanSeat[], people: PlanPerson[], everyone: PlanPerson[], opts: PlanOptions = {}) {
  const range = opts.nearRange ?? DEFAULT_NEAR_RANGE;
  const byUser = new Map(everyone.map((p) => [p.userId, p]));
  const edges = edgeSet(seats);
  const ctx: Ctx = { edges, range, stay: opts.stay };
  const occupant = new Map(seats.filter((s) => s.userId).map((s) => [s.id, s.userId!]));
  const result = new Map<string, string>();

  // A re-plan starts from the plan as it was: people keep their old seat if it's still free and not held.
  const usable = new Map(seats.filter((s) => !s.locked && !s.userId).map((s) => [s.id, s]));
  for (const p of people) {
    const sid = opts.stay?.get(p.userId);
    if (!sid || !usable.has(sid) || occupant.has(sid)) continue;
    occupant.set(sid, p.userId);
    result.set(p.userId, sid);
  }

  // Friend groups (union-find over "near" links) so groups are placed together.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const p of everyone) for (const n of friendIds(p)) if (byUser.has(n)) parent.set(find(p.userId), find(n));
  const groupSize = new Map<string, number>();
  for (const p of people) groupSize.set(find(p.userId), (groupSize.get(find(p.userId)) ?? 0) + 1);

  const queue = people.filter((p) => !result.has(p.userId)).sort(
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
        score += pullScore(p, uid, other, d, range);
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
  const movable = new Set(result.keys());
  // Polish first, so the annealing starts from (and never ends below) what moving one person at a time finds.
  improve(seats, occupant, movable, byUser, ctx);
  if (opts.stay) {
    // A re-plan also tries a calm search that stays close to the old plan, and takes it unless
    // the wide search meets the wishes better: fewer people move for nothing.
    const calm = new Map(occupant);
    const calmScore = anneal(seats, calm, movable, byUser, ctx, CALM);
    const wideScore = anneal(seats, occupant, movable, byUser, ctx, HOT);
    if (calmScore >= wideScore - 1e-9) {
      occupant.clear();
      for (const [sid, uid] of calm) occupant.set(sid, uid);
    }
  } else anneal(seats, occupant, movable, byUser, ctx, HOT);
  improve(seats, occupant, movable, byUser, ctx);
  for (const [seatId, userId] of occupant) if (result.has(userId)) result.set(userId, seatId);
  return result;
}

/**
 * How well one rule is met from `mine` (0..1), or null when it can't be told (the other
 * person has no seat). Wishes to sit together that miss get a little credit for being close,
 * so the improvement pass can tell "almost" from "far away".
 */
function ruleMet(r: SeatRule, mine: PlanSeat, seatOf: Map<string, PlanSeat>, edges: Set<string>, range: number): number | null {
  switch (r.kind) {
    case "next":
    case "near":
    case "avoid": {
      const o = seatOf.get(r.userId);
      if (!o) return null;
      const d = dist(mine, o);
      if (r.kind === "avoid") return d === 1 ? 0 : 1;
      const within = r.kind === "next" ? 1 : range;
      if (d <= within) return 1 - 0.002 * Math.min(d - 1, 10);
      return Number.isFinite(d) ? (0.02 * within) / d : 0;
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

const totalCache = new WeakMap<PlanPerson, number>();
const totalOf = (p: PlanPerson) => {
  let t = totalCache.get(p);
  if (t === undefined) totalCache.set(p, (t = weightsOf(p).reduce((n, x) => n + x, 0)));
  return t;
};

/**
 * One person's weighted satisfaction with where everyone sits (0..1). Like the wish score the
 * leads see, everyone counts the same: a long list of "not right next to" doesn't make one
 * person matter more than someone with a single wish.
 */
function happiness(p: PlanPerson, seatOf: Map<string, PlanSeat>, { edges, range, stay }: Ctx) {
  const mine = seatOf.get(p.userId);
  if (!mine) return 0;
  const kept = stay?.get(p.userId) === mine.id ? STAY : 0;
  if (!p.rules.length) return kept;
  const w = weightsOf(p);
  return kept + p.rules.reduce((n, r, i) => n + w[i] * (ruleMet(r, mine, seatOf, edges, range) ?? 0), 0) / totalOf(p);
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
  ctx: Ctx,
) {
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const seatOf = new Map([...occupant].map(([sid, uid]) => [uid, seatById.get(sid)!]));
  // Whose happiness depends on where someone sits: themselves and everyone with a wish about them.
  const watchers = new Map<string, string[]>();
  for (const p of byUser.values())
    for (const r of p.rules) if ("userId" in r) watchers.set(r.userId, [...(watchers.get(r.userId) ?? []), p.userId]);
  const total = (uids: (string | undefined)[]) => {
    const all = new Set<string>();
    for (const u of uids) if (u) for (const x of [u, ...(watchers.get(u) ?? [])]) all.add(x);
    let n = 0;
    for (const u of all) {
      const p = byUser.get(u);
      if (p) n += happiness(p, seatOf, ctx);
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

/** Small seeded random numbers (mulberry32), so the same wishes always give the same plan. */
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

/**
 * Temperatures: at HOT a step that costs someone a top wish is still taken now and then, at COLD
 * only real improvements are (it's below STAY, so keeping old seats counts by then). CALM is for
 * re-plans that should stay close to the old plan.
 */
const HOT = 0.3;
const CALM = 0.02;
const COLD = 1e-5;
/** Longest stretch of seats `anneal` slides along a row in one step. */
const MAX_SLIDE = 6;
/** Steps per open seat, and at most this many in total, so a re-plan of a big event stays quick. */
const STEPS_PER_SEAT = 3000;
const MAX_STEPS = 150_000;

/**
 * Simulated annealing over the whole plan, after the greedy pass. Moving one person at a time
 * gets stuck: Reykime can't take the free edge seat F1 when that means someone without wishes
 * lands next to a person Reykime's friend wants to avoid, even though shifting the whole group
 * one seat over meets every wish. So besides swapping two seats this also slides a stretch of
 * a row by one seat (everyone in it moves along, the last one jumps to the front), and early on
 * it accepts steps that make things a bit worse to get out of such dead ends. Keeps the best plan seen.
 */
function anneal(
  seats: PlanSeat[],
  occupant: Map<string, string>,
  movable: Set<string>,
  byUser: Map<string, PlanPerson>,
  ctx: Ctx,
  hot: number,
): number {
  // Seats this run may change, in row order: not held, and free or taken by someone placed in this run.
  const open = seats
    .filter((s) => !s.locked && (!occupant.has(s.id) || movable.has(occupant.get(s.id)!)))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  const n = open.length;
  if (n < 2 || !movable.size) return 0;
  const seatById = new Map(seats.map((s) => [s.id, s]));
  const seatOf = new Map([...occupant].map(([sid, uid]) => [uid, seatById.get(sid)!]));
  const who: (string | undefined)[] = open.map((s) => occupant.get(s.id));
  // Without wishes (and no old plan to keep) every plan is as good as any other.
  if (!ctx.stay && ![...byUser.values()].some((p) => p.rules.length)) return 0;
  // Whose happiness depends on where someone sits: themselves (with wishes) and everyone with a wish about them.
  const concerned = new Map<string, PlanPerson[]>();
  const add = (u: string, p: PlanPerson) => {
    const list = concerned.get(u) ?? [];
    if (!list.includes(p)) list.push(p);
    concerned.set(u, list);
  };
  for (const p of byUser.values()) {
    if (p.rules.length || ctx.stay) add(p.userId, p);
    for (const r of p.rules) if ("userId" in r) add(r.userId, p);
  }
  const affected = (uids: (string | undefined)[]) => {
    const all = new Set<PlanPerson>();
    for (const u of uids) if (u) for (const p of concerned.get(u) ?? []) all.add(p);
    return all;
  };
  const sum = (people: Set<PlanPerson>) => {
    let t = 0;
    for (const p of people) t += happiness(p, seatOf, ctx);
    return t;
  };
  const put = (i: number, uid: string | undefined) => {
    who[i] = uid;
    if (uid) seatOf.set(uid, open[i]);
  };
  // Stretches of neighbouring open seats in the same row, for sliding.
  const rowEnd = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--)
    rowEnd[i] = i + 1 < n && open[i + 1].row === open[i].row ? rowEnd[i + 1] : i;

  const rand = random(n * 7919 + movable.size);
  const steps = Math.min(MAX_STEPS, STEPS_PER_SEAT * n);
  let score = sum(new Set([...concerned.values()].flat()));
  let best = score;
  let bestWho = [...who];
  for (let step = 0; step < steps; step++) {
    const temp = hot * (COLD / hot) ** (step / steps);
    const i = Math.floor(rand() * n);
    let from: number;
    let was: (string | undefined)[];
    let moved: (string | undefined)[];
    if (rand() < 0.5 || rowEnd[i] === i) {
      // Swap two seats (with a free one, that's a move).
      const j = Math.floor(rand() * n);
      if (i === j || (!who[i] && !who[j])) continue;
      const [x, y] = i < j ? [i, j] : [j, i];
      from = x;
      was = who.slice(x, y + 1);
      moved = [...was];
      [moved[0], moved[moved.length - 1]] = [was[was.length - 1], was[0]];
    } else {
      // Slide open[i..j] by one seat, either way.
      const j = i + 1 + Math.floor(rand() * Math.min(MAX_SLIDE, rowEnd[i] - i));
      from = i;
      was = who.slice(i, j + 1);
      if (was.every((u) => !u)) continue;
      moved = rand() < 0.5 ? [...was.slice(1), was[0]] : [was[was.length - 1], ...was.slice(0, -1)];
    }
    const people = affected(moved.filter((u, k) => u !== was[k]));
    const before = sum(people);
    moved.forEach((u, k) => put(from + k, u));
    const delta = sum(people) - before;
    if (delta >= 0 || rand() < Math.exp(delta / temp)) score += delta;
    else was.forEach((u, k) => put(from + k, u));
    if (score > best + 1e-9) {
      best = score;
      bestWho = [...who];
    }
  }
  open.forEach((s, i) => {
    const u = bestWho[i];
    if (u) {
      occupant.set(s.id, u);
      seatOf.set(u, s);
    } else occupant.delete(s.id);
  });
  return best;
}

/**
 * `ok` is null while it can't be checked yet (you or the other person has no seat). `rank` is the
 * wish's place in the ranked list, null for "not right next to"; `weight` is what it counts for.
 */
export type WishItem = { text: string; ok: boolean | null; rank: number | null; weight: number };

/** Wishes ranked below this count little (each under 3%); a miss there is shown softer and needs no look. */
export const TOP_WISHES = 5;
/** A missed wish that matters: in the top five, or "not right next to". */
export const missedBadly = (i: WishItem) => i.ok === false && (i.rank === null || i.rank <= TOP_WISHES);
/** `score`: weighted share of the checkable wishes met (0..1); null when none can be checked yet. */
export type WishCheck = { userId: string; items: WishItem[]; score: number | null };

/** Weighted share of met wishes; a top wish counts more than one further down. */
export function wishScore(items: WishItem[]): number | null {
  let met = 0;
  let all = 0;
  for (const i of items) {
    if (i.ok === null) continue;
    all += i.weight;
    if (i.ok) met += i.weight;
  }
  return all ? met / all : null;
}

/** Everyone's scores averaged, each person counting once; null when nothing can be checked yet. */
export function overallScore(checks: WishCheck[]): number | null {
  const scores = checks.flatMap((c) => (c.score === null ? [] : [c.score]));
  return scores.length ? scores.reduce((n, x) => n + x, 0) / scores.length : null;
}

/** Which wishes the current seating meets, per person with wishes: ranked ones first, then "not right next to". */
export function checkWishes(
  seats: PlanSeat[],
  everyone: PlanPerson[],
  nameOf: (id: string) => string,
  t: T = makeT("en"),
  opts: PlanOptions = {},
) {
  const range = opts.nearRange ?? DEFAULT_NEAR_RANGE;
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s]));
  const edges = edgeSet(seats);
  const out: WishCheck[] = [];
  for (const p of everyone) {
    if (!p.rules.length) continue;
    const mine = seatOf.get(p.userId);
    const weights = wishWeights(p.rules);
    let rank = 0;
    const items: WishItem[] = p.rules.map((r, i) => {
      const item = (text: string, ok: (s: PlanSeat) => boolean | null): WishItem => ({
        text,
        ok: mine ? ok(mine) : null,
        rank: isRanked(r) ? ++rank : null,
        weight: weights[i],
      });
      switch (r.kind) {
        case "next":
        case "near":
        case "avoid": {
          const o = seatOf.get(r.userId);
          const name = nameOf(r.userId);
          if (r.kind === "next") return item(t("wishCheck.next", { name }), (m) => (o ? dist(m, o) === 1 : null));
          if (r.kind === "near") return item(t("wishCheck.near", { name, range }), (m) => (o ? dist(m, o) <= range : null));
          return item(t("wishCheck.avoid", { name }), (m) => (o ? dist(m, o) !== 1 : null));
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
