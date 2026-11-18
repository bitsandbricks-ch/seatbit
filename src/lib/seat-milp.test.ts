import assert from "node:assert/strict";
import { test } from "node:test";
import { exactPlan } from "./seat-milp";
import { addClashes, missedWishes, plantedEvent } from "./seating-bench";
import { checkWishes, planSeats, type PlanPerson, type PlanSeat } from "./seating";

/** The leads' wish score summed over everyone, for a plan userId -> seatId. */
const score = (seats: PlanSeat[], people: PlanPerson[], plan: Map<string, string>) => {
  const by = new Map([...plan].map(([u, s]) => [s, u]));
  const placed = seats.map((s) => ({ ...s, userId: by.get(s.id) ?? s.userId }));
  return checkWishes(placed, people, (id) => id).reduce((n, c) => n + (c.score ?? 0), 0);
};

/** Every way to seat everyone (empty seats are ""), for small events. */
function* arrangements(ids: string[]): Generator<string[]> {
  if (ids.length <= 1) return yield ids;
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    if (seen.has(ids[i])) continue;
    seen.add(ids[i]);
    for (const rest of arrangements([...ids.slice(0, i), ...ids.slice(i + 1)])) yield [ids[i], ...rest];
  }
}

/** A made-up event plus a few wishes that clash with it, so not every wish can be met. */
function clashing(seed: number, rows: number[]) {
  const { seats, people } = plantedEvent(seed, rows);
  addClashes(seed, seats, people, 3);
  return { seats, people };
}

async function exact(seats: PlanSeat[], people: PlanPerson[]) {
  const start = planSeats(seats, people, people, { effort: "extended" });
  const occupant = new Map([...start].map(([u, s]) => [s, u]));
  const r = await exactPlan(seats, occupant, new Set(start.keys()), people, 4, Date.now() + 30_000);
  const plan = new Map(start);
  if (r.plan) for (const [s, u] of r.plan) plan.set(u, s);
  return { plan, proven: r.proven, start };
}

test("the exact search finds the best plan there is, and says it proved it", async () => {
  for (const [seed, rows] of [
    [1, [7]],
    [2, [7]],
    [3, [4, 4]],
    [4, [4, 4]],
    [5, [8]],
  ] as const) {
    const { seats, people } = clashing(seed, [...rows]);
    const { plan, proven } = await exact(seats, people);
    let best = -1;
    const ids = [...people.map((p) => p.userId), ...Array<string>(seats.length - people.length).fill("")];
    for (const a of arrangements(ids)) {
      const p = new Map<string, string>();
      a.forEach((u, i) => u && p.set(u, seats[i].id));
      best = Math.max(best, score(seats, people, p));
    }
    assert.ok(proven, `event ${seed}`);
    assert.ok(Math.abs(score(seats, people, plan) - best) < 1e-9, `event ${seed}: ${score(seats, people, plan)} vs ${best}`);
  }
});

test("when every wish is met already, the exact search has nothing to do", async () => {
  const { seats, people } = plantedEvent(0, [10, 10]);
  const { plan, proven, start } = await exact(seats, people);
  assert.deepEqual(missedWishes(seats, people, plan), []);
  assert.ok(proven);
  assert.deepEqual(plan, start);
});

test("held seats and people who stay keep their seats", async () => {
  const seats: PlanSeat[] = Array.from({ length: 5 }, (_, c) => ({ id: `s${c}`, row: 0, col: c, label: `A${c + 1}`, userId: null, locked: c === 0 }));
  const people: PlanPerson[] = [
    { userId: "lead", rules: [], priority: 0, order: 0 },
    { userId: "a", rules: [{ kind: "next", userId: "lead" }, { kind: "seat", seat: "A1" }], priority: 0, order: 0 },
    { userId: "b", rules: [{ kind: "next", userId: "a" }], priority: 0, order: 0 },
    { userId: "c", rules: [{ kind: "avoid", userId: "b" }], priority: 0, order: 0 },
  ];
  // "lead" stays on A3; A1 is held and empty, so a can't get it.
  const occupant = new Map([
    ["s2", "lead"],
    ["s1", "c"],
    ["s3", "b"],
    ["s4", "a"],
  ]);
  const r = await exactPlan(seats, occupant, new Set(["a", "b", "c"]), people, 4, Date.now() + 30_000);
  assert.ok(r.proven);
  const plan = new Map([["s2", "lead"], ...(r.plan ?? occupant)]);
  assert.equal(plan.get("s2"), "lead");
  assert.equal(plan.has("s0"), false);
  const seatOf = new Map([...plan].map(([s, u]) => [u, Number(s.slice(1))]));
  assert.equal(Math.abs(seatOf.get("a")! - 2), 1); // next to the lead
  assert.equal(Math.abs(seatOf.get("b")! - seatOf.get("a")!), 1);
  assert.notEqual(Math.abs(seatOf.get("c")! - seatOf.get("b")!), 1);
});
