import assert from "node:assert/strict";
import { test } from "node:test";
import { planSeats, type PlanPerson, type PlanSeat } from "./seating";

const row = (n: number, taken: Record<number, string> = {}, held: number[] = []): PlanSeat[] =>
  Array.from({ length: n }, (_, col) => ({ id: `s${col + 1}`, row: 0, col, label: `A${col + 1}`, userId: taken[col + 1] ?? null, locked: held.includes(col + 1) }));

const person = (userId: string, p: Partial<PlanPerson> = {}): PlanPerson => ({
  userId,
  near: [],
  avoid: [],
  position: "any",
  seat: "",
  priority: 0,
  order: 0,
  ...p,
});

test("everyone gets a free seat, held seats stay free", () => {
  const seats = row(4, {}, [2]);
  const people = [person("a"), person("b"), person("c")];
  const plan = planSeats(seats, people, people);
  assert.equal(plan.size, 3);
  assert.ok(![...plan.values()].includes("s2"));
  assert.equal(new Set(plan.values()).size, 3);
});

test("friends sit next to each other, people who avoid each other don't", () => {
  const seats = row(6, { 1: "x" });
  const everyone = [person("x"), person("a", { near: ["b"] }), person("b"), person("c", { avoid: ["x"] })];
  const plan = planSeats(seats, everyone.slice(1), everyone);
  const col = (u: string) => Number(plan.get(u)!.slice(1));
  assert.equal(Math.abs(col("a") - col("b")), 1);
  assert.notEqual(col("c"), 2);
});

test("a preferred seat and the edge wish are honoured when free", () => {
  const seats = row(5);
  const everyone = [person("a", { seat: "A3" }), person("b", { position: "edge" })];
  const plan = planSeats(seats, everyone, everyone);
  assert.equal(plan.get("a"), "s3");
  assert.ok(["s1", "s5"].includes(plan.get("b")!));
});

test("more people than seats: the rest stays unseated", () => {
  const everyone = [person("a", { priority: 1 }), person("b"), person("c")];
  const plan = planSeats(row(2), everyone, everyone);
  assert.equal(plan.size, 2);
  assert.ok(plan.has("a"));
});
