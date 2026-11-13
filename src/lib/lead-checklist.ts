import type { Lan } from "@/db/schema";
import type { StepState } from "./checklist";
import { makeT, type T } from "../i18n/translate";

/** Built-in steps a custom to-do can wait for, in checklist order. */
export const LEAD_STEP_DEPS = ["publish", "seats", "tickets", "assign", "finalize", "book"] as const;
export type LeadStepDep = (typeof LEAD_STEP_DEPS)[number];

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
  t?: T;
}): LeadStep[] {
  const t = input.t ?? makeT("en");
  const { lan: l, going, ticketsToConfirm, ticketsConfirmed, seats, seated, booked, spotsToFill, swapsToApprove } = input;
  const base = `/lans/${l.id}/manage`;
  const final = !!l.seatsPublishedAt;
  const steps: LeadStep[] = [];

  steps.push({
    key: "publish",
    title: t("leadSteps.publish"),
    state: l.publishedAt ? "done" : l.publishAt ? "pending" : "todo",
    hint: t(l.publishedAt ? "leadSteps.publishDone" : l.publishAt ? "leadSteps.publishScheduled" : "leadSteps.publishDraft"),
  });

  if (l.interestCheck) {
    steps.push({
      key: "signup",
      title: t("leadSteps.signup"),
      state: "todo",
      hint: t("leadSteps.signupHint"),
    });
  }

  steps.push({
    key: "seats",
    title: t("leadSteps.seats"),
    state: seats > 0 ? "done" : "todo",
    hint: seats > 0 ? t("leadSteps.seatsDone", { count: seats }) : t("leadSteps.seatsHint"),
    href: `${base}?tab=seats`,
  });

  if (spotsToFill > 0) {
    steps.push({
      key: "waitlist",
      title: t("leadSteps.waitlist"),
      state: "todo",
      hint: t("leadSteps.spotsFree", { count: spotsToFill }),
      href: `${base}?tab=attendees#waitlist`,
    });
  }

  // Tickets go on trust: a member saying "I have my ticket" counts. Confirming is optional.
  const withTicket = ticketsConfirmed + ticketsToConfirm;
  const openTickets = going - withTicket;
  steps.push({
    key: "tickets",
    title: t("leadSteps.tickets"),
    state: going > 0 && openTickets <= 0 ? "done" : going > 0 ? "pending" : "todo",
    hint:
      going === 0
        ? t("leadSteps.nobody")
        : openTickets <= 0
          ? ticketsToConfirm > 0
            ? t("leadSteps.allHaveToConfirm", { count: going, confirm: ticketsToConfirm })
            : t("leadSteps.allHave", { count: going })
          : t("leadSteps.notBought", { count: openTickets }) + ".",
    href: `${base}?tab=attendees`,
  });

  if (seats > 0) {
    const picking = l.seatPicking && !final;
    steps.push({
      key: "assign",
      title: t(picking ? "leadSteps.assignPicking" : "leadSteps.assign"),
      state: going > 0 && seated >= going ? "done" : picking ? "pending" : "todo",
      hint:
        going === 0
          ? t("leadSteps.nobody")
          : seated >= going
            ? t("leadSteps.allSeated", { count: going })
            : t("leadSteps.unseated", { left: going - seated, count: going }),
      href: `${base}?tab=seats`,
    });
    steps.push({
      key: "finalize",
      title: t("leadSteps.finalize"),
      state: final ? "done" : "todo",
      hint: t(final ? "leadSteps.finalizeDone" : "leadSteps.finalizeHint"),
      href: `${base}?tab=seats`,
    });
    if (l.externalPlanUrl) {
      steps.push({
        key: "book",
        title: t("leadSteps.book"),
        state: final && seated > 0 && booked >= seated ? "done" : final ? "todo" : "pending",
        hint: final ? t("leadSteps.booked", { booked, count: seated }) : t("leadSteps.afterFinal"),
        href: `${base}?tab=seats#booking`,
      });
    }
    if (swapsToApprove > 0) {
      steps.push({
        key: "swaps",
        title: t("leadSteps.swaps"),
        state: "todo",
        hint: t("leadSteps.swapsWaiting", { count: swapsToApprove }),
        href: `${base}?tab=seats`,
      });
    }
  }
  return steps;
}
