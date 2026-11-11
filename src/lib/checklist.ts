import type { Attendance, Lan } from "@/db/schema";

export type StepState = "done" | "pending" | "todo";
export type ChecklistStep = { key: "going" | "nick" | "ticket" | "seat"; title: string; state: StepState; hint: string };

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

  if (lan.price || lan.paymentDueDate) {
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
      state: seatLabel ? "done" : "pending",
      hint: seatLabel
        ? `Seat ${seatLabel}.`
        : freeSeats === 0
          ? "All of the group's seats are taken. The orgas will sort it out."
          : "The orgas assign seats after the deadline.",
    });
  }
  return steps;
}

export function progress(steps: ChecklistStep[]) {
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}
