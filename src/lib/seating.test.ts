import assert from "node:assert/strict";
import { test } from "node:test";
import { checkWishes, overallScore, planSeats, wishScore, type PlanPerson, type PlanSeat } from "./seating";
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
  // The top wish counts 1, the second 0.6: 1 / 1.6.
  assert.equal(a.score, 1 / 1.6);
  // d has no seat: c's wish can't be checked yet.
  const c = checks.find((x) => x.userId === "c")!;
  assert.equal(c.items[0].ok, null);
  assert.equal(c.score, null);
  assert.equal(overallScore(checks), 1 / 1.6);
});

test("wishScore: met top wish beats met lower wish", () => {
  const top = wishScore([
    { text: "", ok: true, rank: 1 },
    { text: "", ok: false, rank: 2 },
  ])!;
  const low = wishScore([
    { text: "", ok: false, rank: 1 },
    { text: "", ok: true, rank: 2 },
  ])!;
  assert.ok(top > low);
  assert.equal(wishScore([]), null);
});

test("near ranges: right next to needs adjacent, same row accepts any distance", () => {
  const seats = row(6, { 1: "x", 2: "y" });
  // Only A4..A6 are free; "next to x" can't be met, "same row as x" can.
  const everyone = [person("x"), person("y"), person("a", [{ kind: "near", userId: "x", within: 1 }]), person("b", [{ kind: "near", userId: "x", within: "row" }])];
  const plan = planSeats(seats, everyone.slice(2), everyone);
  const checks = checkWishes(
    seats.map((s) => ({ ...s, userId: s.userId ?? [...plan].find(([, sid]) => sid === s.id)?.[0] ?? null })),
    everyone,
    (id) => id,
  );
  assert.equal(checks.find((c) => c.userId === "a")!.items[0].ok, false);
  assert.equal(checks.find((c) => c.userId === "b")!.items[0].ok, true);
});

test("avoid ranges: not within 3 seats keeps the distance", () => {
  const seats = row(6, { 1: "x" });
  const everyone = [person("x"), person("a", [{ kind: "avoid", userId: "x", within: 3 }])];
  const plan = planSeats(seats, [everyone[1]], everyone);
  assert.ok(col(plan, "a") > 4);
});
