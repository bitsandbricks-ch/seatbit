import assert from "node:assert/strict";
import { test } from "node:test";
import { addRule, moveRule, normalizeRules, type SeatRule } from "./seat-rules";

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
