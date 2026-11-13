import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtAmount, parseAmount, splitCents } from "./money";

test("parseAmount reads what people type", () => {
  assert.equal(parseAmount("12.50"), 1250);
  assert.equal(parseAmount("12,5"), 1250);
  assert.equal(parseAmount(" 1'200 "), 120000);
  assert.equal(parseAmount("30"), 3000);
  assert.equal(parseAmount(""), null);
  assert.ok(Number.isNaN(parseAmount("12.345")));
  assert.ok(Number.isNaN(parseAmount("-5")));
  assert.ok(Number.isNaN(parseAmount("abc")));
});

test("splitCents always adds up to the total", () => {
  assert.deepEqual(splitCents(100, 3), [34, 33, 33]);
  assert.deepEqual(splitCents(6000, 4), [1500, 1500, 1500, 1500]);
  assert.deepEqual(splitCents(5, 0), []);
  for (const [total, n] of [[9999, 7], [1, 3], [123456, 13]]) {
    assert.equal(splitCents(total, n).reduce((a, b) => a + b, 0), total);
  }
});

test("fmtAmount keeps the cents", () => {
  assert.equal(fmtAmount(1250, "CHF"), "CHF 12.50");
  assert.equal(fmtAmount(3000, "EUR"), "EUR 30.00");
});
