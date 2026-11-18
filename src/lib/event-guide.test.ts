import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attendance, Lan } from "@/db/schema";
import { eventGuide, wishesTowards } from "./event-guide";

const DAY = 86_400_000;
const now = new Date("2026-11-16T12:00:00Z");
const lan = (o: Partial<Lan> = {}) =>
  ({
    startsAt: new Date(now.getTime() + 10 * DAY),
    endsAt: new Date(now.getTime() + 12 * DAY),
    seatsPublishedAt: null,
    seatPicking: false,
    signupDeadline: null,
    paymentDueDate: null,
    capacity: null,
    waitlistAuto: true,
    externalPlanUrl: "",
    ...o,
  }) as Lan;
const att = (o: Partial<Attendance> = {}) =>
  ({ status: "going", ticketBought: false, paid: false, wishRules: [], wishNote: "", seatBooked: false, ...o }) as Attendance;
const base = { seatLabel: null, seatCount: 12, seatRange: "A1–B6", now };
const at = (steps: { key: string; state: string }[]) => steps.find((s) => s.state === "now")?.key;

test("the waitlist stays on the first step", () => {
  assert.equal(at(eventGuide({ ...base, lan: lan({ capacity: 12 }), attendance: att({ status: "waitlist" }) })), "answer");
});

test("coming without a ticket: the ticket step", () => {
  assert.equal(at(eventGuide({ ...base, lan: lan(), attendance: att() })), "ticket");
});

test("self pick: seat step until you picked, then the leads' step", () => {
  const l = lan({ seatPicking: true });
  assert.equal(at(eventGuide({ ...base, lan: l, attendance: att({ ticketBought: true }) })), "seat");
  assert.equal(at(eventGuide({ ...base, lan: l, attendance: att({ ticketBought: true }), seatLabel: "A2" })), "final");
});

test("final with booking on the event site waits for the booking", () => {
  const l = lan({ seatsPublishedAt: now, externalPlanUrl: "https://example.com/plan" });
  assert.equal(at(eventGuide({ ...base, lan: l, attendance: att({ ticketBought: true }), seatLabel: "A2" })), "final");
  assert.equal(at(eventGuide({ ...base, lan: l, attendance: att({ ticketBought: true, seatBooked: true }), seatLabel: "A2" })), "lan");
});

test("the waitlist rule is explained only when the group has a size", () => {
  const open = eventGuide({ ...base, lan: lan(), attendance: undefined });
  const full = eventGuide({ ...base, lan: lan({ capacity: 12 }), attendance: undefined });
  assert.doesNotMatch(open[0].body, /waitlist/);
  assert.match(full[0].body, /waitlist/);
});

test("only friendly wishes about me count, never «not right next to»", () => {
  const rows = [
    { userId: "ben", status: "going", wishRules: [{ kind: "near" as const, userId: "me" }] },
    { userId: "eva", status: "going", wishRules: [{ kind: "avoid" as const, userId: "me" }] },
    { userId: "tim", status: "declined", wishRules: [{ kind: "next" as const, userId: "me" }] },
    { userId: "me", status: "going", wishRules: [{ kind: "next" as const, userId: "ben" }] },
  ];
  assert.deepEqual(wishesTowards("me", rows), [{ userId: "ben", kind: "near" }]);
});
