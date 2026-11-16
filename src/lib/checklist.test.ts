import assert from "node:assert/strict";
import { test } from "node:test";
import type { Attendance, Lan } from "@/db/schema";
import { buildChecklist, onTheDay, progress, type StepKey } from "./checklist";

const DAY = 86_400_000;
const now = new Date("2026-11-16T12:00:00Z");
const lan = (o: Partial<Lan> = {}) =>
  ({
    startsAt: new Date(now.getTime() + 10 * DAY),
    endsAt: new Date(now.getTime() + 12 * DAY),
    seatsPublishedAt: null,
    seatPicking: false,
    signupDeadline: null,
    cancelledAt: null,
    dateTbd: false,
    externalPlanUrl: "",
    ...o,
  }) as Lan;
const going = (o: Partial<Attendance> = {}) =>
  ({ status: "going", ticketBought: false, paid: false, wishRules: [], wishNote: "", seatBooked: false, arrivedAt: null, ...o }) as Attendance;
const base = { hasNick: true, seatLabel: null, hasSeatPlan: true, freeSeats: 3, now };
const keys = (steps: { key: StepKey }[]) => steps.map((s) => s.key);
const state = (steps: { key: StepKey; state: string }[], key: StepKey) => steps.find((s) => s.key === key)?.state;

test("someone who hasn't answered sees the answer, nick and ticket steps only", () => {
  const steps = buildChecklist({ ...base, lan: lan(), attendance: undefined });
  assert.deepEqual(keys(steps), ["going", "nick", "ticket"]);
  assert.equal(state(steps, "going"), "todo");
});

test("waitlist is pending, not a to-do", () => {
  const steps = buildChecklist({ ...base, lan: lan(), attendance: going({ status: "waitlist" }), waitlistPlace: 2 });
  assert.equal(state(steps, "going"), "pending");
  assert.match(steps[0].hint, /2/);
});

test("lead-assigned seats: wishes are optional and don't hold back the progress", () => {
  const steps = buildChecklist({ ...base, lan: lan(), attendance: going({ ticketBought: true }) });
  assert.deepEqual(keys(steps), ["going", "nick", "ticket", "wishes", "seat"]);
  assert.equal(steps.find((s) => s.key === "wishes")?.optional, true);
  assert.equal(state(steps, "seat"), "pending");
  // going, nick, ticket done; open optional wishes not counted; seat pending.
  assert.deepEqual(progress(steps), { done: 3, total: 4 });
});

test("self pick: picking is the to-do until a seat is taken, then it waits for the leads", () => {
  const open = buildChecklist({ ...base, lan: lan({ seatPicking: true }), attendance: going({ ticketBought: true }) });
  assert.deepEqual(keys(open), ["going", "nick", "ticket", "pick", "seat"]);
  assert.equal(state(open, "pick"), "todo");
  assert.equal(state(open, "seat"), "todo");
  const picked = buildChecklist({ ...base, lan: lan({ seatPicking: true }), attendance: going({ ticketBought: true }), seatLabel: "F3" });
  assert.equal(state(picked, "pick"), "done");
  assert.equal(state(picked, "seat"), "pending");
});

test("a final plan with my seat brings games, and check-in on the day", () => {
  const final = lan({ seatsPublishedAt: new Date(now.getTime() - DAY) });
  const steps = buildChecklist({ ...base, lan: final, attendance: going({ ticketBought: true }), seatLabel: "F3", games: { voted: 3, toInstall: 1 } });
  assert.equal(state(steps, "seat"), "done");
  assert.equal(state(steps, "games"), "todo");
  assert.equal(keys(steps).includes("checkin"), false);

  const onDay = lan({ seatsPublishedAt: final.seatsPublishedAt, startsAt: new Date(now.getTime() - 3600_000), endsAt: new Date(now.getTime() + DAY) });
  const day = buildChecklist({ ...base, lan: onDay, attendance: going({ ticketBought: true }), seatLabel: "F3" });
  assert.equal(state(day, "checkin"), "todo");
});

test("check-in opens 6 hours before the start and never for cancelled or undated events", () => {
  const at = (h: number) => lan({ startsAt: new Date(now.getTime() + h * 3600_000), endsAt: new Date(now.getTime() + 48 * 3600_000) });
  assert.equal(onTheDay(at(5), now), true);
  assert.equal(onTheDay(at(7), now), false);
  assert.equal(onTheDay(lan({ startsAt: new Date(now.getTime() - 1), endsAt: new Date(now.getTime() + DAY), cancelledAt: now }), now), false);
  assert.equal(onTheDay(lan({ startsAt: new Date(now.getTime() - 1), endsAt: new Date(now.getTime() + DAY), dateTbd: true }), now), false);
});
