import type { Attendance, Lan } from "@/db/schema";

export type StepState = "done" | "pending" | "todo";
export type ChecklistStep = { key: "going" | "nick" | "ticket" | "seat" | "book"; title: string; state: StepState; hint: string };

/** The per-LAN to-do list for an attendee. */
export function buildChecklist(input: {
  lan: Lan;
  attendance: Attendance | undefined;
  hasNick: boolean;
  seatLabel: string | null;
  hasSeatPlan: boolean;
  freeSeats: number;
}): ChecklistStep[] {
  const { lan, attendance: a, hasNick, seatLabel, hasSeatPlan, freeSeats } = input;
  const steps: ChecklistStep[] = [];

  steps.push({
    key: "going",
    title: "Say you're coming",
    state: a?.status === "going" ? "done" : a?.status === "waitlist" ? "pending" : "todo",
    hint:
      a?.status === "going"
        ? "You're going."
        : a?.status === "waitlist"
          ? "You're on the waitlist."
          : lan.signupDeadline
            ? "Answer before the deadline."
            : "Let the orgas know.",
  });

  steps.push({
    key: "nick",
    title: "Give your nickname",
    state: hasNick ? "done" : "todo",
    hint: hasNick ? "Nick is set." : "Add the nick you want on the seat plan.",
  });

  // Every LAN the group goes to needs a ticket, so this step is always there
  // (it used to depend on a price or payment date being set).
  {
    steps.push({
      key: "ticket",
      title: "Buy your ticket",
      state: a?.paid ? "done" : a?.ticketBought ? "pending" : "todo",
      hint: a?.paid
        ? "Confirmed by the orgas."
        : a?.ticketBought
          ? "Waiting for an orga to confirm."
          : "Buy it from the event, then tick it off here.",
    });
  }

  if (hasSeatPlan && a?.status === "going") {
    steps.push({
      key: "seat",
      title: "Get your seat",
      // Only final once the orgas finalized the plan, also when you picked your seat yourself.
      state: lan.seatsPublishedAt && seatLabel ? "done" : seatLabel ? "pending" : lan.seatPicking && !lan.seatsPublishedAt ? "todo" : "pending",
      hint: lan.seatsPublishedAt
        ? seatLabel
          ? `Seat ${seatLabel}, final.`
          : "The plan is final but you have no seat yet. An orga will get back to you."
        : seatLabel
          ? `Seat ${seatLabel} for now. The orgas check and finalize the seat plan.`
          : lan.seatPicking
            ? "Self pick is on: tick that you have your ticket, then take a free seat on the Seats tab."
            : freeSeats === 0
              ? "The orgas will finalize the seat plan soon."
              : "Add seat wishes on the Seats tab. The orgas finalize the seat plan after the deadline.",
    });
  }
  // The event's own seat plan (e.g. lal.gg): members book the seat they got there themselves.
  if (lan.externalPlanUrl && lan.seatsPublishedAt && a?.status === "going" && seatLabel) {
    steps.push({
      key: "book",
      title: `Book ${seatLabel} on the event site`,
      state: a.seatBooked ? "done" : "todo",
      hint: a.seatBooked ? "Booked." : "Reserve the same seat on the event's seat plan, then tick it off.",
    });
  }
  return steps;
}

export function progress(steps: ChecklistStep[]) {
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}
