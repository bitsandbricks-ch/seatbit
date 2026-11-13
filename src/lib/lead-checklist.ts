import type { Lan } from "@/db/schema";
import type { StepState } from "./checklist";

export type LeadStep = { key: string; title: string; state: StepState; hint: string; href?: string };

/** The leads' to-do list for one event, from the counts the Manage page already has. */
export function buildLeadChecklist(input: {
  lan: Lan;
  going: number;
  /** Tickets reported by members, waiting for a lead to confirm. */
  ticketsToConfirm: number;
  ticketsConfirmed: number;
  seats: number;
  seated: number;
  /** Seated people whose seat a lead ticked as booked on the event site. */
  booked: number;
  /** Free spots with people waiting, when the leads move people up by hand. */
  spotsToFill: number;
  swapsToApprove: number;
}): LeadStep[] {
  const { lan: l, going, ticketsToConfirm, ticketsConfirmed, seats, seated, booked, spotsToFill, swapsToApprove } = input;
  const base = `/lans/${l.id}/manage`;
  const final = !!l.seatsPublishedAt;
  const steps: LeadStep[] = [];

  steps.push({
    key: "publish",
    title: "Publish the event",
    state: l.publishedAt ? "done" : l.publishAt ? "pending" : "todo",
    hint: l.publishedAt ? "Members see it." : l.publishAt ? "Goes live by itself at the set time." : "It's a draft: only leads see it. Publish it at the top.",
  });

  if (l.interestCheck) {
    steps.push({
      key: "signup",
      title: "Open sign-up",
      state: "todo",
      hint: "The interest check is running. Use Open sign-up at the top once you know you're going."
    });
  }

  steps.push({
    key: "seats",
    title: "Enter the group's seats",
    state: seats > 0 ? "done" : "todo",
    hint: seats > 0 ? `${seats} seats.` : "Add the seat block the event gave the group.",
    href: `${base}?tab=seats`,
  });

  if (spotsToFill > 0) {
    steps.push({
      key: "waitlist",
      title: "Move people up from the waitlist",
      state: "todo",
      hint: `${spotsToFill === 1 ? "A spot is" : `${spotsToFill} spots are`} free.`,
      href: `${base}?tab=attendees#waitlist`,
    });
  }

  const openTickets = going - ticketsConfirmed - ticketsToConfirm;
  steps.push({
    key: "tickets",
    title: "Confirm tickets",
    state: going > 0 && ticketsConfirmed === going ? "done" : ticketsToConfirm > 0 ? "todo" : "pending",
    hint:
      going === 0
        ? "Nobody is coming yet."
        : ticketsConfirmed === going
          ? `All ${going} confirmed.`
          : [ticketsToConfirm > 0 && `${ticketsToConfirm} to confirm`, openTickets > 0 && `${openTickets} not bought yet`].filter(Boolean).join(", ") + ".",
    href: `${base}?tab=attendees`,
  });

  if (seats > 0) {
    const picking = l.seatPicking && !final;
    steps.push({
      key: "assign",
      title: picking ? "Members pick, you fill the gaps" : "Seat everyone",
      state: going > 0 && seated >= going ? "done" : picking ? "pending" : "todo",
      hint: going === 0 ? "Nobody is coming yet." : seated >= going ? `All ${going} seated.` : `${going - seated} of ${going} without a seat.`,
      href: `${base}?tab=seats`,
    });
    steps.push({
      key: "finalize",
      title: "Finalize the seat plan",
      state: final ? "done" : "todo",
      hint: final ? "Members see their final seat." : "Closes wishes and self pick and shows everyone the plan.",
      href: `${base}?tab=seats`,
    });
    if (l.externalPlanUrl) {
      steps.push({
        key: "book",
        title: "Book the seats on the event site",
        state: final && seated > 0 && booked >= seated ? "done" : final ? "todo" : "pending",
        hint: final ? `${booked} of ${seated} booked.` : "After the plan is final.",
        href: `${base}?tab=seats#booking`,
      });
    }
    if (swapsToApprove > 0) {
      steps.push({
        key: "swaps",
        title: "Approve seat swaps",
        state: "todo",
        hint: `${swapsToApprove} waiting.`,
        href: `${base}?tab=seats`,
      });
    }
  }
  return steps;
}
