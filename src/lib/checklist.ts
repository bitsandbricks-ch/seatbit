import type { Attendance, Lan } from "@/db/schema";
import { makeT, type T } from "@/i18n/translate";

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
  /** Place on the waitlist (1 = next), when waitlisted. */
  waitlistPlace?: number;
  /** Language of the titles and hints; English when left out. */
  t?: T;
}): ChecklistStep[] {
  const { lan, attendance: a, hasNick, seatLabel, hasSeatPlan, freeSeats, waitlistPlace } = input;
  const t = input.t ?? makeT("en");
  const steps: ChecklistStep[] = [];

  steps.push({
    key: "going",
    title: t("checklist.going.title"),
    state: a?.status === "going" ? "done" : a?.status === "waitlist" ? "pending" : "todo",
    hint:
      a?.status === "going"
        ? t("checklist.going.done")
        : a?.status === "waitlist"
          ? waitlistPlace
            ? t("checklist.going.waitlistAt", { place: waitlistPlace })
            : t("checklist.going.waitlist")
          : lan.signupDeadline
            ? t("checklist.going.deadline")
            : t("checklist.going.todo"),
  });

  steps.push({
    key: "nick",
    title: t("checklist.nick.title"),
    state: hasNick ? "done" : "todo",
    hint: hasNick ? t("checklist.nick.done") : t("checklist.nick.todo"),
  });

  // Every LAN the group goes to needs a ticket, so this step is always there
  // (it used to depend on a price or payment date being set).
  {
    steps.push({
      key: "ticket",
      title: t("checklist.ticket.title"),
      state: a?.paid ? "done" : a?.ticketBought ? "pending" : "todo",
      hint: a?.paid
        ? t("checklist.ticket.done")
        : a?.ticketBought
          ? t("checklist.ticket.pending")
          : t("checklist.ticket.todo"),
    });
  }

  if (hasSeatPlan && a?.status === "going") {
    steps.push({
      key: "seat",
      title: t("checklist.seat.title"),
      // Only final once the leads finalized the plan, also when you picked your seat yourself.
      state: lan.seatsPublishedAt && seatLabel ? "done" : seatLabel ? "pending" : lan.seatPicking && !lan.seatsPublishedAt ? "todo" : "pending",
      hint: lan.seatsPublishedAt
        ? seatLabel
          ? t("checklist.seat.final", { seat: seatLabel })
          : t("checklist.seat.finalNone")
        : seatLabel
          ? t("checklist.seat.forNow", { seat: seatLabel })
          : lan.seatPicking
            ? t("checklist.seat.selfPick")
            : freeSeats === 0
              ? t("checklist.seat.soon")
              : t("checklist.seat.wishes"),
    });
  }
  // The event's own seat plan (e.g. lal.gg): members book the seat they got there themselves.
  if (lan.externalPlanUrl && lan.seatsPublishedAt && a?.status === "going" && seatLabel) {
    steps.push({
      key: "book",
      title: t("checklist.book.title", { seat: seatLabel }),
      state: a.seatBooked ? "done" : "todo",
      hint: a.seatBooked ? t("checklist.book.done") : t("checklist.book.todo"),
    });
  }
  return steps;
}

export function progress(steps: ChecklistStep[]) {
  return { done: steps.filter((s) => s.state === "done").length, total: steps.length };
}
