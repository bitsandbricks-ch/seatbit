import assert from "node:assert/strict";
import { test } from "node:test";
import { answerStrength, guestAnswerWins } from "./answer-strength";

const a = (status: "going" | "maybe" | "declined" | "waitlist", ticketBought = false, paid = false) => ({ status, ticketBought, paid });

test("keeps the member's answer on a tie", () => {
  assert.equal(guestAnswerWins(a("going"), a("going")), false);
});

test("takes the guest's ticket over the member's plain coming", () => {
  assert.equal(guestAnswerWins(a("going", true), a("going")), true);
  assert.equal(guestAnswerWins(a("going", true, true), a("going", true)), true);
});

test("takes any yes over the member's no", () => {
  assert.equal(guestAnswerWins(a("maybe"), a("declined")), true);
  assert.equal(guestAnswerWins(a("declined"), a("maybe")), false);
});

test("ranks coming over waitlist over unsure", () => {
  assert.ok(answerStrength(a("going")) > answerStrength(a("waitlist")));
  assert.ok(answerStrength(a("waitlist")) > answerStrength(a("maybe")));
});

test("ignores stale ticket flags on a no", () => {
  assert.equal(answerStrength(a("declined", true, true)), 0);
});
