import assert from "node:assert/strict";
import { test } from "node:test";
import { fmtBytes, fmtDate, fmtMoney, fmtRange, lanRange } from "./format";

// Local dates, so the tests don't depend on the machine's time zone.
const sat = new Date(2026, 10, 14, 18, 0);
const sun = new Date(2026, 10, 15, 16, 0);

test("dates are Swiss style with a 24h clock", () => {
  assert.equal(fmtDate(sat), "Sat 14.11.2026, 18:00");
  assert.equal(fmtDate(sat, "de"), "Sa 14.11.2026, 18:00");
  assert.equal(fmtDate(null), "—");
  assert.equal(fmtDate(new Date(2026, 0, 2, 9, 5)), "Fri 02.01.2026, 09:05");
});

test("ranges name the year once when both ends share it", () => {
  assert.equal(fmtRange(sat, sun), "Sat 14.11., 18:00 – Sun 15.11.2026, 16:00");
  assert.equal(fmtRange(new Date(2026, 11, 31, 18), new Date(2027, 0, 1, 12)), "Thu 31.12.2026, 18:00 – Fri 01.01.2027, 12:00");
});

test("events with an open date show the hint", () => {
  assert.equal(lanRange({ startsAt: sat, endsAt: sun, dateTbd: true, dateHint: "Spring 2027" }), "Date not set (Spring 2027)");
  assert.equal(lanRange({ startsAt: sat, endsAt: sun, dateTbd: true }, "de"), "Datum noch offen");
});

test("money and sizes", () => {
  assert.equal(fmtMoney(2000, "chf"), "CHF 20");
  assert.equal(fmtMoney(1250, "CHF"), "CHF 12.50");
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(1536 * 1024), "1.5 MB");
});
