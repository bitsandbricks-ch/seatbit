import { z } from "zod";

/**
 * A member's seat wishes: ranked wishes (the first one matters most; one "right next to", up to four "near")
 * plus any number of "not right next to" people, which aren't ranked. Pure helpers, safe for client components.
 */
export const SEAT_RULE_KINDS = ["next", "near", "avoid", "seat", "row", "edge", "middle"] as const;
export type SeatRuleKind = (typeof SEAT_RULE_KINDS)[number];

export type SeatRule =
  /** Right next to someone. At most one per member. */
  | { kind: "next"; userId: string }
  /** Within the event's near range (Manage → Seats, default 4 seats). */
  | { kind: "near"; userId: string }
  /** Not right next to someone. Any number, not ranked. */
  | { kind: "avoid"; userId: string }
  | { kind: "seat"; seat: string }
  | { kind: "row"; row: string }
  | { kind: "edge" }
  | { kind: "middle" };

/** Ranked wishes have no real cap; this only stops runaway lists. */
export const MAX_WISHES = 20;
/** At most this many "near" people: more and "near" stops meaning anything. */
export const MAX_NEAR = 4;
/** "Not right next to" is unlimited in spirit; this only stops runaway lists. */
export const MAX_AVOIDS = 30;
/** How many seats apart still counts as "near", unless the leads set another value for the event. */
export const DEFAULT_NEAR_RANGE = 4;
export const MIN_NEAR_RANGE = 2;
export const MAX_NEAR_RANGE = 12;

const person = z.string().min(1).max(64);
export const seatRuleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("next"), userId: person }),
  z.object({ kind: z.literal("near"), userId: person }),
  z.object({ kind: z.literal("avoid"), userId: person }),
  z.object({ kind: z.literal("seat"), seat: z.string().trim().min(1).max(12) }),
  z.object({ kind: z.literal("row"), row: z.string().trim().min(1).max(4) }),
  z.object({ kind: z.literal("edge") }),
  z.object({ kind: z.literal("middle") }),
]);
export const seatRulesSchema = z.array(seatRuleSchema).max(MAX_WISHES + MAX_AVOIDS);

/** Ranked wishes count towards the cap and the order; "not right next to" does neither. */
export const isRanked = (r: SeatRule) => r.kind !== "avoid";
export const isPersonRule = (r: SeatRule): r is Extract<SeatRule, { userId: string }> =>
  r.kind === "next" || r.kind === "near" || r.kind === "avoid";

/** One key per rule; two rules with the same key are the same wish. */
export function ruleKey(r: SeatRule): string {
  switch (r.kind) {
    case "next":
    case "near":
    case "avoid":
      // Wishes about the same person replace each other: next, near and avoid contradict.
      return `person:${r.userId}`;
    case "seat":
      return `seat:${r.seat.toUpperCase()}`;
    case "row":
      return `row:${r.row.toUpperCase()}`;
    case "edge":
    case "middle":
      return "position";
  }
}

/**
 * Cleans a rule list: upper-case seats and rows, no wishes about yourself, the higher-ranked of two
 * contradicting rules wins, only the first "right next to" stays one (later ones become "near"), at
 * most four "near", and the ranked wishes first, then "not right next to".
 */
export function normalizeRules(rules: SeatRule[], selfId?: string): SeatRule[] {
  const seen = new Set<string>();
  const ranked: SeatRule[] = [];
  const avoids: SeatRule[] = [];
  let hasNext = false;
  let nears = 0;
  for (const r of rules) {
    let clean: SeatRule =
      r.kind === "seat" ? { kind: "seat", seat: r.seat.trim().toUpperCase() } : r.kind === "row" ? { kind: "row", row: r.row.trim().toUpperCase() } : r;
    if (isPersonRule(clean)) {
      if (clean.userId === selfId) continue;
      // Drop leftovers such as an old range: a person rule is just kind + who.
      clean = { kind: clean.kind, userId: clean.userId };
    }
    if (clean.kind === "next") {
      if (hasNext) clean = { kind: "near", userId: clean.userId };
      hasNext = true;
    }
    const key = ruleKey(clean);
    if (seen.has(key)) continue;
    if (clean.kind === "near" && ++nears > MAX_NEAR) continue;
    seen.add(key);
    if (isRanked(clean)) {
      if (ranked.length < MAX_WISHES) ranked.push(clean);
    } else if (avoids.length < MAX_AVOIDS) avoids.push(clean);
  }
  return [...ranked, ...avoids];
}

/** Why a rule list can't be saved as it is, or null. */
export function rulesProblem(rules: SeatRule[]): "tooMany" | "twoNext" | "tooManyNear" | null {
  const ranked = rules.filter(isRanked);
  if (ranked.length > MAX_WISHES) return "tooMany";
  if (ranked.filter((r) => r.kind === "near").length > MAX_NEAR) return "tooManyNear";
  if (ranked.filter((r) => r.kind === "next").length > 1) return "twoNext";
  return null;
}

/**
 * Adds a rule at the end, or replaces the rule it contradicts in place (so "edge" after "middle"
 * keeps middle's rank).
 */
export function addRule(rules: SeatRule[], rule: SeatRule): SeatRule[] {
  const key = ruleKey(rule);
  const at = rules.findIndex((r) => ruleKey(r) === key);
  if (at === -1) return [...rules, rule];
  return rules.map((r, i) => (i === at ? rule : r));
}

/** Moves the rule at `from` to `to`. */
export function moveRule<T>(rules: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= rules.length) return rules;
  const next = [...rules];
  const [r] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, r);
  return next;
}

/** People named in the rules. */
export const rulePeople = (rules: SeatRule[]) => rules.flatMap((r) => (isPersonRule(r) ? [r.userId] : []));

/**
 * Weight of the ranked wish at `rank` (0 = top). Each step down counts half, so a wish
 * outweighs all the wishes below it together.
 */
export const rankWeight = (rank: number) => 0.5 ** rank;

/** "Right next to" is the most specific wish, so it pulls harder than its rank alone says. */
export const NEXT_BOOST = 1.5;
/**
 * Each "not right next to" counts as much as all of a member's ranked wishes together: it is
 * easy to keep (only two neighbours) and sitting next to the wrong person ruins the weekend.
 */
export const AVOID_WEIGHT = 1;

/**
 * A member's weights per rule, in list order. Ranked wishes share a total of 1 by rank (so ten
 * wishes count as much in total as one), "right next to" gets a boost, and every
 * "not right next to" counts AVOID_WEIGHT on its own.
 */
export function wishWeights(rules: SeatRule[]): number[] {
  const rankedCount = rules.filter(isRanked).length;
  let sum = 0;
  for (let i = 0; i < rankedCount; i++) sum += rankWeight(i);
  let rank = 0;
  return rules.map((r) => {
    if (!isRanked(r)) return AVOID_WEIGHT;
    const w = rankWeight(rank++) / sum;
    return r.kind === "next" ? w * NEXT_BOOST : w;
  });
}

/** Clamps a stored or typed near range to what the planner supports. */
export const clampNearRange = (n: number | null | undefined) =>
  Number.isFinite(n) ? Math.min(MAX_NEAR_RANGE, Math.max(MIN_NEAR_RANGE, Math.round(n as number))) : DEFAULT_NEAR_RANGE;
