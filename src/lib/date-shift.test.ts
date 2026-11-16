import assert from "node:assert/strict";
import { test } from "node:test";
import { shiftDays, shiftExact } from "./date-shift";

test("the end keeps the event's length", () => {
  assert.equal(shiftExact("2026-12-18T16:00", "2026-12-16T18:00", "2027-12-14T10:00"), "2027-12-16T08:00");
  assert.equal(shiftExact("", "2026-12-16T18:00", "2027-12-14T10:00"), "");
});

test("deadlines move by days and keep their time", () => {
  assert.equal(shiftDays("2026-11-16T23:59", "2026-12-16T18:00", "2027-12-14T10:00"), "2027-11-14T23:59");
  // Only the time of the start changed: the deadline stays.
  assert.equal(shiftDays("2026-11-16T23:59", "2026-12-16T18:00", "2026-12-16T09:00"), "2026-11-16T23:59");
  // Across the end of daylight saving time (last Sunday of October) the time still stays.
  assert.equal(shiftDays("2026-10-01T23:59", "2026-10-20T18:00", "2026-11-03T18:00"), "2026-10-15T23:59");
  assert.equal(shiftDays("2026-11-16T23:59", "", "2027-12-14T10:00"), "");
});
