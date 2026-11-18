import type { Attendance, Lan } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { makeT, type T } from "@/i18n/translate";
import type { SeatRule } from "@/lib/seat-rules";

export type GuideState = "done" | "now" | "later";
export type GuideStep = { key: "answer" | "ticket" | "seat" | "final" | "lan"; title: string; body: string; state: GuideState };

/**
 * "How this event works": the whole flow from answering to the LAN, in five steps, worded for this
 * event (its deadlines, waitlist rule, self pick, booking) and with the step you're at marked.
 * One place for the explanations that used to repeat on every tab. Pure, so it's easy to test.
 */
export function eventGuide(input: {
  lan: Lan;
  attendance: Attendance | undefined;
  /** My seat: final, or picked while self pick is on. */
  seatLabel: string | null;
  seatCount: number;
  /** "A1–B6" */
  seatRange: string | null;
  now?: Date;
  t?: T;
}): GuideStep[] {
  const t = input.t ?? makeT("en");
  const { lan: l, attendance: a, seatLabel, seatCount, seatRange } = input;
  const now = input.now ?? new Date();
  const going = a?.status === "going";
  const hasTicket = !!a && (a.ticketBought || a.paid);
  const final = !!l.seatsPublishedAt;
  const booking = !!l.externalPlanUrl;
  const over = now >= l.endsAt;
  const date = (d: Date | null) => (d ? fmtDate(d, t.locale) : null);

  const answerBy = date(l.signupDeadline);
  const ticketBy = date(l.paymentDueDate);
  const steps: Omit<GuideStep, "state">[] = [
    {
      key: "answer",
      title: t("howItWorks.answer.title"),
      body: [
        answerBy ? t("howItWorks.answer.by", { date: answerBy }) : t("howItWorks.answer.any"),
        l.capacity != null ? t(l.waitlistAuto ? "howItWorks.answer.waitlistAuto" : "howItWorks.answer.waitlistManual") : null,
      ]
        .filter(Boolean)
        .join(" "),
    },
    {
      key: "ticket",
      title: t("howItWorks.ticket.title"),
      body: [ticketBy ? t("howItWorks.ticket.by", { date: ticketBy }) : t("howItWorks.ticket.any"), t("howItWorks.ticket.locked")].join(" "),
    },
    {
      key: "seat",
      title: t("howItWorks.seat.title"),
      body: [
        seatCount > 0 && seatRange ? t("howItWorks.seat.block", { count: seatCount, range: seatRange }) : t("howItWorks.seat.noBlock"),
        l.seatPicking ? t("howItWorks.seat.pick") : t("howItWorks.seat.wishes"),
      ].join(" "),
    },
    {
      key: "final",
      title: t(booking ? "howItWorks.final.titleBook" : "howItWorks.final.title"),
      body: t(booking ? "howItWorks.final.bodyBook" : "howItWorks.final.body"),
    },
    { key: "lan", title: t("howItWorks.lan.title"), body: t("howItWorks.lan.body") },
  ];

  // Where you are: the first step that still needs you (or the leads). Waitlist stays on step 1.
  const seatDone = l.seatPicking ? !!seatLabel : (a?.wishRules ?? []).length > 0 || !!a?.wishNote;
  const at = over
    ? steps.length
    : !going
      ? 0
      : !hasTicket
        ? 1
        : !final
          ? seatDone
            ? 3
            : 2
          : booking && !a?.seatBooked
            ? 3
            : 4;
  return steps.map((s, i) => ({ ...s, state: i < at ? "done" : i === at ? "now" : "later" }));
}

/**
 * Who wished to sit next to or near me: others coming (or maybe/waitlist) whose wishes name me.
 * Only the friendly kinds; "not right next to" is never shown to the person it names.
 */
export function wishesTowards(
  meId: string,
  rows: { userId: string; status: string; wishRules: SeatRule[] | null }[],
): { userId: string; kind: "next" | "near" }[] {
  return rows.flatMap((r) => {
    if (r.userId === meId || r.status === "declined") return [];
    const hit = (r.wishRules ?? []).find((w) => (w.kind === "next" || w.kind === "near") && w.userId === meId);
    return hit ? [{ userId: r.userId, kind: hit.kind as "next" | "near" }] : [];
  });
}
