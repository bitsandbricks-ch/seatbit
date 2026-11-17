import assert from "node:assert/strict";
import { test } from "node:test";
import { makeT } from "../i18n/translate";
import { parseSeatSpec, seatSpecCount } from "./seat-spec";

const t = makeT("en");

test("parseSeatSpec puts each letter in its own row", () => {
  assert.deepEqual(parseSeatSpec("F1-F3, G2, f4", t), [["F1", "F2", "F3", "F4"], ["G2"]]);
});

test("seatSpecCount counts the seats, and 0 for a list it can't read", () => {
  assert.equal(seatSpecCount("F1-F16, F19-F22", t), 20);
  assert.equal(seatSpecCount("", t), 0);
  assert.equal(seatSpecCount("12", t), 0);
});
