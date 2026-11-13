import type { Attendance, Lan } from "@/db/schema";

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

const hasWishes = (a: Attendance) =>
  a.wishNear.length > 0 || a.wishAvoid.length > 0 || a.wishPosition !== "any" || !!a.wishSeat || !!a.wishNote;

/** The per-LAN to-do list for an attendee. */
export function buildChecklist(input: {
  lan: Lan;
  attendance: Attendance | undefined;
  hasNick: boolean;
  /** My seat: the final one, or the one I picked myself while self pick is on. Null while orga assignments are private. */
  seatLabel: string | null;
  hasSeatPlan: boolean;
  freeSeats: number;
  /** Place on the waitlist (1 = next), when waitlisted. */
  waitlistPlace?: number;
  /** Games someone voted for, and how many of them I haven't marked installed. Left out: no games step. */
  games?: { voted: number; toInstall: number };
  now?: Date;
}): ChecklistStep[] {
  const { lan, attendance: a, hasNick, seatLabel, hasSeatPlan, freeSeats, waitlistPlace, games } = input;
  const now = input.now ?? new Date();
  const final = !!lan.seatsPublishedAt;
  const going = a?.status === "going";
  const hasTicket = !!a && (a.ticketBought || a.paid);
  const steps: ChecklistStep[] = [];

  steps.push({
    key: "going",
    title: "Say you're coming",
    state: going ? "done" : a?.status === "waitlist" ? "pending" : "todo",
    hint: going
      ? "You're going."
      : a?.status === "waitlist"
        ? waitlistPlace
          ? `You're #${waitlistPlace} on the waitlist.`
          : "You're on the waitlist."
        : lan.signupDeadline
          ? "Answer before the deadline."
          : "Let the leads know.",
  });

  steps.push({
    key: "nick",
    title: "Give your nickname",
    state: hasNick ? "done" : "todo",
    hint: hasNick ? "Nick is set." : "Add the nick you want on the seat plan.",
  });

  // Every LAN the group goes to needs a ticket, so this step is always there.
  steps.push({
    key: "ticket",
    title: "Buy your ticket",
    state: a?.paid ? "done" : a?.ticketBought ? "pending" : "todo",
    hint: a?.paid
      ? "Confirmed by the leads."
      : a?.ticketBought
        ? "Waiting for a lead to confirm."
        : "Buy it from the event, then tick it off here.",
  });

  if (hasSeatPlan && going) {
    // Step 4 depends on the event: members pick their own seat (self pick on), or optionally send
    // wishes and the leads place them. `seatPicking` stays set after finalizing, so the step stays put.
    if (lan.seatPicking) {
      steps.push({
        key: "pick",
        title: "Pick your seat",
        state: seatLabel || final ? "done" : "todo",
        hint: seatLabel
          ? final
            ? `You sit at ${seatLabel}.`
            : `You took ${seatLabel}. You can still change it on the Seats tab.`
          : final
            ? "Self pick is closed. The leads place you."
            : hasTicket
              ? freeSeats > 0
                ? "Take a free seat on the Seats tab."
                : "No free seats left. The leads will place you."
              : "Tick that you have your ticket first, then take a free seat on the Seats tab.",
      });
    } else if (!final || hasWishes(a)) {
      const wished = hasWishes(a);
      steps.push({
        key: "wishes",
        title: "Send seat wishes",
        optional: true,
        state: wished ? "done" : "todo",
        hint: final
          ? "Sent. The plan is final now."
          : wished
            ? "Sent. You can change them until the leads finalize the plan."
            : "Optional: who you'd like to sit near, on the Seats tab.",
      });
    }

    // Step 5: the leads always finalize the plan, also after self pick. They also book it on the event site.
    steps.push({
      key: "seat",
      title: "Leads confirm your seat",
      state: final && seatLabel ? "done" : lan.seatPicking && !final && !seatLabel ? "todo" : "pending",
      hint: final
        ? seatLabel
          ? `Seat ${seatLabel}, final.${lan.externalPlanUrl ? (a.seatBooked ? " Booked on the event site." : " The leads book it on the event site.") : ""}`
          : "The plan is final but you have no seat yet. A lead will get back to you."
        : seatLabel
          ? `The leads check ${seatLabel} and finalize the seat plan.`
          : lan.seatPicking
            ? "Once you picked a seat, the leads check and finalize the plan."
            : "The leads assign the seats and finalize the plan after the deadline.",
    });
  }

  // Games and check-in come after the leads confirmed the seat, so the list stays short until then.
  const confirmed = final && !!seatLabel;

  // Games the group wants to play: install them before the LAN, the venue's internet is slow.
  if (going && confirmed && games && games.voted > 0 && now < lan.endsAt) {
    steps.push({
      key: "games",
      title: "Install the games",
      optional: true,
      state: games.toInstall === 0 ? "done" : "todo",
      hint:
        games.toInstall === 0
          ? "All installed."
          : `${games.toInstall} of ${games.voted} still to install. Tick them off on the Games tab.`,
    });
  }

  // On the day: tell the others you made it.
  if (going && confirmed && onTheDay(lan, now)) {
    steps.push({
      key: "checkin",
      title: "Check in at the venue",
      state: a.arrivedAt ? "done" : "todo",
      hint: a.arrivedAt ? "You're here." : "Tap \"I'm here\" when you arrive.",
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
