import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWishes, overallScore, planSeats, wishScore, wishWeights, type PlanPerson, type PlanSeat } from "./seating";
import type { SeatRule } from "./seat-rules";

const row = (n: number, taken: Record<number, string> = {}, held: number[] = [], r = 0): PlanSeat[] =>
  Array.from({ length: n }, (_, col) => ({
    id: `s${r}-${col + 1}`,
    row: r,
    col,
    label: `${String.fromCharCode(65 + r)}${col + 1}`,
    userId: taken[col + 1] ?? null,
    locked: held.includes(col + 1),
  }));

const person = (userId: string, rules: SeatRule[] = [], p: Partial<PlanPerson> = {}): PlanPerson => ({
  userId,
  rules,
  priority: 0,
  order: 0,
  ...p,
});
const near = (userId: string): SeatRule => ({ kind: "near", userId });
const avoid = (userId: string): SeatRule => ({ kind: "avoid", userId });
const col = (plan: Map<string, string>, u: string) => Number(plan.get(u)!.split("-")[1]);

test("everyone gets a free seat, held seats stay free", () => {
  const seats = row(4, {}, [2]);
  const people = [person("a"), person("b"), person("c")];
  const plan = planSeats(seats, people, people);
  assert.equal(plan.size, 3);
  assert.ok(![...plan.values()].includes("s0-2"));
  assert.equal(new Set(plan.values()).size, 3);
});

test("friends sit next to each other, people who avoid each other don't", () => {
  const seats = row(6, { 1: "x" });
  const everyone = [person("x"), person("a", [near("b")]), person("b"), person("c", [avoid("x")])];
  const plan = planSeats(seats, everyone.slice(1), everyone);
  assert.equal(Math.abs(col(plan, "a") - col(plan, "b")), 1);
  assert.notEqual(col(plan, "c"), 2);
});

test("a preferred seat and the edge wish are honoured when free", () => {
  const seats = row(5);
  const everyone = [person("a", [{ kind: "seat", seat: "A3" }]), person("b", [{ kind: "edge" }])];
  const plan = planSeats(seats, everyone, everyone);
  assert.equal(plan.get("a"), "s0-3");
  assert.ok(["s0-1", "s0-5"].includes(plan.get("b")!));
});

test("a row wish puts the person in that row", () => {
  const seats = [...row(3), ...row(3, {}, [], 1)];
  const everyone = [person("a", [{ kind: "row", row: "B" }])];
  assert.equal(planSeats(seats, everyone, everyone).get("a")!.startsWith("s1-"), true);
});

test("the higher-ranked wish wins when two can't both be met", () => {
  // x sits in the middle of row A; row B is empty. Near x and row B can't both happen.
  const seats = [...row(3, { 2: "x" }), ...row(3, {}, [], 1)];
  const x = person("x");
  const rowFirst = [x, person("a", [{ kind: "row", row: "B" }, near("x")])];
  assert.ok(planSeats(seats, [rowFirst[1]], rowFirst).get("a")!.startsWith("s1-"));
  const nearFirst = [x, person("a", [near("x"), { kind: "row", row: "B" }])];
  assert.ok(planSeats(seats, [nearFirst[1]], nearFirst).get("a")!.startsWith("s0-"));
});

test("ranked seats: the first free one is taken", () => {
  const seats = row(4, { 2: "x" });
  const everyone = [person("x"), person("a", [{ kind: "seat", seat: "A2" }, { kind: "seat", seat: "A4" }, { kind: "seat", seat: "A1" }])];
  assert.equal(planSeats(seats, [everyone[1]], everyone).get("a"), "s0-4");
});

test("more people than seats: the rest stays unseated", () => {
  const everyone = [person("a", [], { priority: 1 }), person("b"), person("c")];
  const plan = planSeats(row(2), everyone, everyone);
  assert.equal(plan.size, 2);
  assert.ok(plan.has("a"));
});

test("checkWishes lists wishes in rank order and scores them by rank", () => {
  const seats = row(4, { 1: "a", 2: "b", 4: "c" });
  const everyone = [person("a", [near("b"), { kind: "seat", seat: "A4" }]), person("b"), person("c", [near("d")])];
  const checks = checkWishes(seats, everyone, (id) => id.toUpperCase());
  const a = checks.find((c) => c.userId === "a")!;
  assert.deepEqual(
    a.items.map((i) => [i.rank, i.ok]),
    [
      [1, true],
      [2, false],
    ],
  );
  // The top wish counts 1, the second 0.5: 1 / 1.5.
  assert.equal(a.score, 1 / 1.5);
  // d has no seat: c's wish can't be checked yet.
  const c = checks.find((x) => x.userId === "c")!;
  assert.equal(c.items[0].ok, null);
  assert.equal(c.score, null);
  assert.equal(overallScore(checks), 1 / 1.5);
});

test("wishScore: met top wish beats met lower wish", () => {
  const top = wishScore([
    { text: "", ok: true, rank: 1, weight: 2 / 3 },
    { text: "", ok: false, rank: 2, weight: 1 / 3 },
  ])!;
  const low = wishScore([
    { text: "", ok: false, rank: 1, weight: 2 / 3 },
    { text: "", ok: true, rank: 2, weight: 1 / 3 },
  ])!;
  assert.ok(top > low);
  assert.equal(wishScore([]), null);
});

test("right next to needs the seat beside, near accepts the event's range", () => {
  const seats = row(8, { 1: "x", 2: "y" });
  // Only A3..A8 are free and y sits beside x: "next to x" can't be met, "near x" (within 4) can.
  const everyone = [person("x"), person("y"), person("a", [{ kind: "next", userId: "x" }]), person("b", [near("x")])];
  const plan = planSeats(seats, everyone.slice(2), everyone, { nearRange: 4 });
  const seated = seats.map((s) => ({ ...s, userId: s.userId ?? [...plan].find(([, sid]) => sid === s.id)?.[0] ?? null }));
  const checks = checkWishes(seated, everyone, (id) => id, undefined, { nearRange: 4 });
  assert.equal(checks.find((c) => c.userId === "a")!.items[0].ok, false);
  assert.equal(checks.find((c) => c.userId === "b")!.items[0].ok, true);
  assert.ok(col(plan, "b") <= 5);
  // With "near" set to 2 seats, the same spot can be too far.
  const tight = checkWishes(seated.map((s) => (s.userId === "b" ? { ...s, userId: null } : s)).map((s) => (s.label === "A6" ? { ...s, userId: "b" } : s)), everyone, (id) => id, undefined, { nearRange: 2 });
  assert.equal(tight.find((c) => c.userId === "b")!.items[0].ok, false);
});

test("not right next to keeps the seat beside free of that person", () => {
  const seats = row(3, { 1: "x" });
  const everyone = [person("x"), person("a", [avoid("x")])];
  const plan = planSeats(seats, [everyone[1]], everyone);
  assert.notEqual(col(plan, "a"), 2);
});

test("a later near wish is met even when the friends were seated first", () => {
  // One row of 20, like a real event. Reykime and Atzera want each other and the first seat;
  // Pascal wants Rosi right next to them, then Reykime and Atzera. A chain of friends gets in the way.
  const seats = row(20, {}, [], 5);
  const chain = Array.from({ length: 10 }, (_, i) => person(`m${i}`, [near(`m${(i + 1) % 10}`)], { priority: 2 }));
  const everyone = [
    person("reykime", [{ kind: "next", userId: "atzera" }, { kind: "seat", seat: "F1" }], { priority: 2 }),
    person("atzera", [{ kind: "next", userId: "reykime" }], { priority: 2 }),
    ...chain,
    person("rosi", [near("pascal")]),
    person("pascal", [{ kind: "next", userId: "rosi" }, near("reykime"), near("atzera"), avoid("m0"), avoid("m1"), avoid("m2"), avoid("m3"), avoid("m4")]),
  ];
  const plan = planSeats(seats, everyone, everyone);
  const d = (a: string, b: string) => Math.abs(col(plan, a) - col(plan, b));
  assert.equal(d("reykime", "atzera"), 1);
  assert.equal(d("pascal", "rosi"), 1, "next to Rosi");
  assert.ok(d("pascal", "reykime") <= 4 || d("pascal", "atzera") <= 4, "near Reykime or Atzera");
  for (const m of ["m0", "m1", "m2", "m3", "m4"]) assert.notEqual(d("pascal", m), 1, `not next to ${m}`);
});

test("wish weights: ranked wishes add up to 1, next to gets a boost, each not-next-to counts on its own", () => {
  const sum = (w: number[]) => w.reduce((n, x) => n + x, 0);
  const three = wishWeights([{ kind: "edge" }, near("a"), near("b")]);
  const four = wishWeights([near("a"), near("b"), near("c"), near("d")]);
  assert.ok(Math.abs(sum(three) - 1) < 1e-9);
  assert.ok(Math.abs(sum(four) - 1) < 1e-9);
  assert.ok(Math.abs(three[1] / three[0] - 0.5) < 1e-9);
  const withNext = wishWeights([{ kind: "next", userId: "a" }, near("b")]);
  assert.ok(Math.abs(withNext[0] - (2 / 3) * 1.5) < 1e-9);
  // Avoids don't dilute the ranked wishes.
  const withAvoids = wishWeights([near("a"), avoid("x"), avoid("y")]);
  assert.deepEqual(withAvoids, [1, 1, 1]);
});
