import type { Attendance, Lan } from "@/db/schema";
import { makeT, type T } from "@/i18n/translate";

export type StepState = "done" | "pending" | "todo";
export type StepKey = "going" | "nick" | "ticket" | "wishes" | "pick" | "seat" | "games" | "checkin";
export type ChecklistStep = {
  key: StepKey;
  title: string;
  state: StepState;
  hint: string;
  /** Nice to have: an open optional step doesn't count against "All set". */
  optional?: boolean;
};

/** Whether the attendee wished anything about their seat. */
export const hasWishes = (a: Attendance) =>
  a.wishNear.length > 0 || a.wishAvoid.length > 0 || a.wishPosition !== "any" || !!a.wishSeat || !!a.wishNote;

/** The per-LAN to-do list for an attendee. */
export function buildChecklist(input: {
  lan: Lan;
  attendance: Attendance | undefined;
  hasNick: boolean;
  /** My seat: the final one, or the one I picked myself while self pick is on. Null while lead assignments are private. */
  seatLabel: string | null;
  hasSeatPlan: boolean;
  freeSeats: number;
  /** Place on the waitlist (1 = next), when waitlisted. */
  waitlistPlace?: number;
  /** Games someone voted for, and how many of them I haven't marked installed. Left out: no games step. */
  games?: { voted: number; toInstall: number };
  now?: Date;
  /** Language of the titles and hints; English when left out. */
  t?: T;
}): ChecklistStep[] {
  const t = input.t ?? makeT("en");
  const { lan, attendance: a, hasNick, seatLabel, hasSeatPlan, freeSeats, waitlistPlace, games } = input;
  const now = input.now ?? new Date();
  const final = !!lan.seatsPublishedAt;
  const going = a?.status === "going";
  const hasTicket = !!a && (a.ticketBought || a.paid);
  const steps: ChecklistStep[] = [];

  steps.push({
    key: "going",
    title: t("checklist.going.title"),
    state: going ? "done" : a?.status === "waitlist" ? "pending" : "todo",
    hint: going
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

  // Every LAN the group goes to needs a ticket, so this step is always there.
  steps.push({
    key: "ticket",
    title: t("checklist.ticket.title"),
    // Trust based: the member's own "I have my ticket" is enough, no lead confirmation needed.
    state: hasTicket ? "done" : "todo",
    hint: hasTicket
      ? t("checklist.ticket.done")
      : a?.status === "waitlist"
          ? t("checklist.ticket.waitlist")
          : t("checklist.ticket.todo"),
  });

  if (hasSeatPlan && going) {
    // Step 4 depends on the event: members pick their own seat (self pick on), or optionally send
    // wishes and the leads place them. `seatPicking` stays set after finalizing, so the step stays put.
    if (lan.seatPicking) {
      steps.push({
        key: "pick",
        // Picked: say so in the title too, so it doesn't read like a to-do.
        title: seatLabel ? t("checklist.pick.picked", { seat: seatLabel }) : t("checklist.pick.title"),
        state: seatLabel || final ? "done" : "todo",
        hint: seatLabel
          ? final
            ? t("checklist.pick.final", { seat: seatLabel })
            : t("checklist.pick.took", { seat: seatLabel })
          : final
            ? t("checklist.pick.closed")
            : hasTicket
              ? freeSeats > 0
                ? t("checklist.pick.take")
                : t("checklist.pick.none")
              : t("checklist.pick.ticketFirst"),
      });
    } else if (!final || hasWishes(a)) {
      const wished = hasWishes(a);
      steps.push({
        key: "wishes",
        title: t("checklist.wishes.title"),
        optional: true,
        state: wished ? "done" : "todo",
        hint: final
          ? t("checklist.wishes.final")
          : wished
            ? t("checklist.wishes.sent")
            : t("checklist.wishes.todo"),
      });
    }

    // Step 5: the leads always finalize the plan, also after self pick. They also book it on the event site.
    steps.push({
      key: "seat",
      title: t("checklist.seat.title"),
      state: final && seatLabel ? "done" : lan.seatPicking && !final && !seatLabel ? "todo" : "pending",
      hint: final
        ? seatLabel
          ? `${t("checklist.seat.final", { seat: seatLabel })}${lan.externalPlanUrl ? ` ${a.seatBooked ? t("checklist.seat.booked") : t("checklist.seat.leadsBook")}` : ""}`
          : t("checklist.seat.finalNone")
        : seatLabel
          ? t("checklist.seat.check", { seat: seatLabel })
          : lan.seatPicking
            ? t("checklist.seat.afterPick")
            : t("checklist.seat.assign"),
    });
  }

  // Games and check-in come after the leads confirmed the seat, so the list stays short until then.
  const confirmed = final && !!seatLabel;

  // Games the group wants to play: install them before the LAN, the venue's internet is slow.
  if (going && confirmed && games && games.voted > 0 && now < lan.endsAt) {
    steps.push({
      key: "games",
      title: t("checklist.games.title"),
      optional: true,
      state: games.toInstall === 0 ? "done" : "todo",
      hint:
        games.toInstall === 0
          ? t("checklist.games.done")
          : t("checklist.games.todo", { left: games.toInstall, count: games.voted }),
    });
  }

  // On the day: tell the others you made it.
  if (going && confirmed && onTheDay(lan, now)) {
    steps.push({
      key: "checkin",
      title: t("checklist.checkin.title"),
      state: a.arrivedAt ? "done" : "todo",
      hint: a.arrivedAt ? t("checklist.checkin.done") : t("checklist.checkin.todo"),
    });
  }
  return steps;
}

/** Check-in runs from 6 hours before the start until the end. */
export function onTheDay(lan: Lan, now = new Date()) {
  return !lan.cancelledAt && !lan.dateTbd && now.getTime() >= lan.startsAt.getTime() - 6 * 3600_000 && now < lan.endsAt;
}

/** Steps that count: all required ones, optional ones only once done. */
export function progress(steps: ChecklistStep[]) {
  const counted = steps.filter((s) => !s.optional || s.state === "done");
  return { done: counted.filter((s) => s.state === "done").length, total: counted.length };
}
