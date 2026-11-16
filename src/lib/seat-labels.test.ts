import assert from "node:assert/strict";
import { test } from "node:test";
import { rowLetter, seatLabel, seatRow } from "./seat-labels";

test("rowLetter counts like spreadsheet columns", () => {
  assert.equal(rowLetter(0), "A");
  assert.equal(rowLetter(25), "Z");
  assert.equal(rowLetter(26), "AA");
  assert.equal(rowLetter(27), "AB");
  assert.equal(rowLetter(51), "AZ");
  assert.equal(rowLetter(52), "BA");
  assert.equal(rowLetter(701), "ZZ");
  assert.equal(rowLetter(702), "AAA");
});

test("seatLabel numbers seats from 1", () => {
  assert.equal(seatLabel(0, 0), "A1");
  assert.equal(seatLabel(5, 19), "F20");
});

test("seatRow reads the row from the label, else from the row number", () => {
  assert.equal(seatRow({ label: "F7", row: 0 }), "F");
  assert.equal(seatRow({ label: "aa12", row: 3 }), "AA");
  assert.equal(seatRow({ label: "12", row: 2 }), "C");
});
