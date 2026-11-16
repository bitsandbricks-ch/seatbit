import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTyped } from "./date-time-picker";

const evening = { hh: 18, mm: 0 };
const now = new Date(2026, 10, 16, 12, 0); // Mon 16.11.2026

test("parseTyped reads Swiss dates with and without a time", () => {
  assert.deepEqual(parseTyped("14.12.2027 10:30", evening, now), { y: 2027, m: 11, d: 14, hh: 10, mm: 30 });
  assert.deepEqual(parseTyped("14.12.2027", evening, now), { y: 2027, m: 11, d: 14, hh: 18, mm: 0 });
  assert.deepEqual(parseTyped("1.2.27 9", evening, now), { y: 2027, m: 1, d: 1, hh: 9, mm: 0 });
  assert.deepEqual(parseTyped("2027-03-05T07:15", evening, now), { y: 2027, m: 2, d: 5, hh: 7, mm: 15 });
});

test("parseTyped moves a past date without a year to next year", () => {
  assert.equal(parseTyped("01.03.", evening, now)?.y, 2027);
  assert.equal(parseTyped("20.12.", evening, now)?.y, 2026);
});

test("parseTyped rejects impossible dates and times", () => {
  assert.equal(parseTyped("31.02.2027", evening, now), null);
  assert.equal(parseTyped("14.13.2027", evening, now), null);
  assert.equal(parseTyped("14.12.2027 24:00", evening, now), null);
  assert.equal(parseTyped("tomorrow", evening, now), null);
  assert.equal(parseTyped("  ", evening, now), null);
});
