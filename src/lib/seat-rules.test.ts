import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_WISHES, addRule, moveRule, normalizeRules, rulesProblem, type SeatRule } from "./seat-rules";

test("normalizeRules: upper-cases, drops self and keeps the higher-ranked of contradicting rules", () => {
  const rules: SeatRule[] = [
    { kind: "near", userId: "b" },
    { kind: "seat", seat: " f7 " },
    { kind: "avoid", userId: "b" },
    { kind: "near", userId: "me" },
    { kind: "middle" },
    { kind: "edge" },
    { kind: "row", row: "c" },
    { kind: "seat", seat: "F7" },
  ];
  assert.deepEqual(normalizeRules(rules, "me"), [
    { kind: "near", userId: "b" },
    { kind: "seat", seat: "F7" },
    { kind: "middle" },
    { kind: "row", row: "C" },
  ]);
});

test("addRule appends, or replaces a contradicting rule in place", () => {
  const rules: SeatRule[] = [{ kind: "middle" }, { kind: "near", userId: "b" }];
  assert.deepEqual(addRule(rules, { kind: "seat", seat: "A1" }), [...rules, { kind: "seat", seat: "A1" }]);
  assert.deepEqual(addRule(rules, { kind: "edge" }), [{ kind: "edge" }, { kind: "near", userId: "b" }]);
  assert.deepEqual(addRule(rules, { kind: "avoid", userId: "b" }), [{ kind: "middle" }, { kind: "avoid", userId: "b" }]);
});

test("moveRule moves one item", () => {
  assert.deepEqual(moveRule(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveRule(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveRule(["a", "b", "c"], 1, 1), ["a", "b", "c"]);
});

test("normalizeRules: one right next to, at most four near, not-next-to after them", () => {
  const rules = [
    { kind: "avoid", userId: "z" },
    { kind: "next", userId: "a" },
    { kind: "next", userId: "b" },
    { kind: "seat", seat: "A1" },
    { kind: "edge" },
    { kind: "row", row: "B" },
    { kind: "avoid", userId: "y" },
  ] as SeatRule[];
  assert.deepEqual(normalizeRules(rules), [
    { kind: "next", userId: "a" },
    { kind: "near", userId: "b" },
    { kind: "seat", seat: "A1" },
    { kind: "edge" },
    { kind: "row", row: "B" },
    { kind: "avoid", userId: "z" },
    { kind: "avoid", userId: "y" },
  ]);
});

test("normalizeRules drops leftovers of the old distance options", () => {
  const old = [{ kind: "near", userId: "a", within: 3 }, { kind: "avoid", userId: "b", within: "row" }] as unknown as SeatRule[];
  assert.deepEqual(normalizeRules(old), [
    { kind: "near", userId: "a" },
    { kind: "avoid", userId: "b" },
  ]);
});

test("rulesProblem: four near, one right next to, any number of not-next-to", () => {
  const near = (u: string): SeatRule => ({ kind: "near", userId: u });
  const avoid = (u: string): SeatRule => ({ kind: "avoid", userId: u });
  assert.equal(rulesProblem([near("a"), near("b"), near("c"), near("d"), ...Array.from({ length: 10 }, (_, i) => avoid(`x${i}`))]), null);
  assert.equal(rulesProblem([near("a"), near("b"), near("c"), near("d"), near("e")]), "tooManyNear");
  assert.equal(rulesProblem(Array.from({ length: MAX_WISHES + 1 }, (_, i) => ({ kind: "seat", seat: `A${i}` }))), "tooMany");
  assert.equal(rulesProblem([{ kind: "next", userId: "a" }, { kind: "next", userId: "b" }]), "twoNext");
});

test("normalizeRules keeps only the first four near", () => {
  const rules = ["a", "b", "c", "d", "e"].map((u) => ({ kind: "near", userId: u }) as SeatRule);
  assert.deepEqual(normalizeRules([...rules, { kind: "edge" }]).map((r) => ("userId" in r ? r.userId : r.kind)), ["a", "b", "c", "d", "edge"]);
});
