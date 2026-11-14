import { z } from "zod";

/**
 * A member's seat wishes are an ordered list of rules: the first one matters most.
 * Pure helpers, safe for client components.
 */
export const SEAT_RULE_KINDS = ["near", "avoid", "seat", "row", "edge", "middle"] as const;
export type SeatRuleKind = (typeof SEAT_RULE_KINDS)[number];

/** How close "near" means: seats apart at most, or anywhere in the same row. */
export const NEAR_RANGES = [1, 2, 3, "row"] as const;
export type NearRange = (typeof NEAR_RANGES)[number];
/** Older wishes have no range: they meant "at most two seats apart". */
export const DEFAULT_NEAR_RANGE: NearRange = 2;
/** Older "not next to" wishes meant directly beside. */
export const DEFAULT_AVOID_RANGE: NearRange = 1;
/** The range a near or avoid rule means, with the defaults for older wishes. */
export const rangeOf = (r: { kind: "near" | "avoid"; within?: NearRange }): NearRange =>
  r.within ?? (r.kind === "near" ? DEFAULT_NEAR_RANGE : DEFAULT_AVOID_RANGE);

export type SeatRule =
  | { kind: "near"; userId: string; within?: NearRange }
  | { kind: "avoid"; userId: string; within?: NearRange }
  | { kind: "seat"; seat: string }
  | { kind: "row"; row: string }
  | { kind: "edge" }
  | { kind: "middle" };

export const MAX_SEAT_RULES = 20;

export const seatRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("near"),
    userId: z.string().min(1).max(64),
    within: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal("row")]).optional(),
  }),
  z.object({
    kind: z.literal("avoid"),
    userId: z.string().min(1).max(64),
    within: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal("row")]).optional(),
  }),
  z.object({ kind: z.literal("seat"), seat: z.string().trim().min(1).max(12) }),
  z.object({ kind: z.literal("row"), row: z.string().trim().min(1).max(4) }),
  z.object({ kind: z.literal("edge") }),
  z.object({ kind: z.literal("middle") }),
]);
export const seatRulesSchema = z.array(seatRuleSchema).max(MAX_SEAT_RULES);

/** One key per rule; two rules with the same key are the same wish. */
export function ruleKey(r: SeatRule): string {
  switch (r.kind) {
    case "near":
    case "avoid":
      // Near and avoid for the same person contradict each other: one key for both.
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
 * Cleans a rule list: upper-case seats and rows, no wishes about yourself, and for
 * contradicting or repeated rules the higher-ranked one wins.
 */
export function normalizeRules(rules: SeatRule[], selfId?: string): SeatRule[] {
  const seen = new Set<string>();
  const out: SeatRule[] = [];
  for (const r of rules) {
    const clean: SeatRule =
      r.kind === "seat" ? { kind: "seat", seat: r.seat.trim().toUpperCase() } : r.kind === "row" ? { kind: "row", row: r.row.trim().toUpperCase() } : r;
    if ((clean.kind === "near" || clean.kind === "avoid") && clean.userId === selfId) continue;
    const key = ruleKey(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.slice(0, MAX_SEAT_RULES);
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
export const rulePeople = (rules: SeatRule[]) =>
  rules.flatMap((r) => (r.kind === "near" || r.kind === "avoid" ? [r.userId] : []));

/**
 * Weight of the rule at `rank` (0 = top). Each step down counts a bit over half as
 * much, so a higher rule always beats the one right below it.
 */
export const rankWeight = (rank: number) => 0.6 ** rank;

/** Whether two seats `d` apart in the same row (Infinity: other rows) are close enough. */
export const withinRange = (d: number, within: NearRange = DEFAULT_NEAR_RANGE) =>
  within === "row" ? Number.isFinite(d) : d <= within;

/** Message key part for each range (message keys can't be numbers). */
export const RANGE_KEY = { 1: "next", 2: "two", 3: "three", row: "row" } as const satisfies Record<NearRange, string>;
