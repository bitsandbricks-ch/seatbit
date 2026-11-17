import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangementOf, cleanVariantName, movesBetween, nextVariantName, seatsWithVariant } from "./seat-variant-math";

const seat = (label: string, col: number, userId: string | null = null, locked = false) => ({ id: label, row: 0, col, label, userId, locked });

test("arrangementOf keeps only taken seats", () => {
  assert.deepEqual(arrangementOf([seat("F1", 0, "a"), seat("F2", 1), seat("F3", 2, "b")]), { F1: "a", F3: "b" });
});

test("seatsWithVariant puts the variant's people on the seats", () => {
  const seats = [seat("F1", 0, "x"), seat("F2", 1), seat("F3", 2, "y", true)];
  const out = seatsWithVariant(seats, { F2: "a", F3: "b" }, new Set(["a", "b", "x", "y"]));
  assert.deepEqual(
    out.map((s) => [s.label, s.userId, s.locked]),
    [
      ["F1", null, false],
      ["F2", "a", false],
      ["F3", "b", true],
    ],
  );
});

test("seatsWithVariant skips people no longer coming, gone seats and doubles", () => {
  const seats = [seat("F1", 0), seat("F2", 1), seat("F3", 2)];
  const out = seatsWithVariant(seats, { F1: "a", F2: "gone", F3: "a", G9: "b" }, new Set(["a", "b"]));
  assert.deepEqual(
    out.map((s) => s.userId),
    ["a", null, null],
  );
});

test("movesBetween lists who changed seat", () => {
  const before = [seat("F1", 0, "a"), seat("F2", 1, "b"), seat("F3", 2, "c")];
  const after = [seat("F1", 0, "b"), seat("F2", 1, "a"), seat("F3", 2, "c"), seat("F4", 3, "d")];
  assert.deepEqual(movesBetween(before, after), [
    { u: "b", from: "F2", to: "F1" },
    { u: "a", from: "F1", to: "F2" },
    { u: "d", from: null, to: "F4" },
  ]);
  assert.deepEqual(movesBetween(after, after), []);
  assert.deepEqual(movesBetween([seat("F1", 0, "a")], [seat("F1", 0)]), [{ u: "a", from: "F1", to: null }]);
});

test("variant names", () => {
  assert.equal(cleanVariantName("  Friends   up front "), "Friends up front");
  assert.equal(cleanVariantName("x".repeat(100)).length, 60);
  assert.equal(nextVariantName([], "Variant"), "Variant 1");
  assert.equal(nextVariantName(["Variant 2", "Mine"], "Variant"), "Variant 3");
  assert.equal(nextVariantName(["variant 2"], "Variant"), "Variant 3");
  assert.equal(nextVariantName(["Variant 2", "Variant 3"], "Variant"), "Variant 4");
});
