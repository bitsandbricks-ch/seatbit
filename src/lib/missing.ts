import { and, eq, inArray, like } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, ReminderKind, User } from "@/db/schema";
import { discordEnabled } from "./discord-api";
import { fmtDate } from "./format";
import { isGuestEmail } from "./guests";
import { appUrl } from "./mail";
import { notify, type Notice } from "./notify";
import { makeT } from "../i18n/translate";
import { localeOf } from "../i18n/user-locale";

const { attendance, clanMember, user, seat, nickname, reminderLog, lanInterest, account } = schema;

/**
 * Steps members still owe for an event. "member" steps can be nudged (DM / mail);
 * "orga" steps are the leads' own to-dos and only link to the right tab.
 */
export const MISSING_STEPS = {
  interest: { who: "member", title: "No answer to the interest check", short: "interest check" },
  answer: { who: "member", title: "No answer yet", short: "answer" },
  unsure: { who: "member", title: "Still unsure", short: "unsure" },
  ticket: { who: "member", title: "No ticket yet", short: "ticket" },
  nick: { who: "member", title: "No nickname", short: "nickname" },
  seat: { who: "member", title: "Hasn't picked a seat", short: "pick a seat" },
  confirm: { who: "orga", title: "Ticket to confirm", short: "confirm ticket" },
  assign: { who: "orga", title: "No seat assigned", short: "assign seat" },
  book: { who: "orga", title: "Seat not booked on the event site", short: "book seat" },
} as const;
export type MissingStep = keyof typeof MISSING_STEPS;
export type NudgeStep = { [K in MissingStep]: (typeof MISSING_STEPS)[K]["who"] extends "member" ? K : never }[MissingStep];
export const NUDGE_STEPS = (Object.keys(MISSING_STEPS) as MissingStep[]).filter(
  (s): s is NudgeStep => MISSING_STEPS[s].who === "member",
);

/** Don't nudge the same person about the same step more than once in this window. */
export const NUDGE_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export type Reach = { discord: boolean; email: boolean };

export type MissingPerson = {
  userId: string;
  reach: Reach;
  /** Last nudge for this step, if any. */
  nudgedAt: Date | null;
  /** Extra context, e.g. the seat label for "book". */
  detail?: string;
};

export type MissingGroup = { step: MissingStep; people: MissingPerson[] };

const nudgeKind = (s: NudgeStep) => `nudge_${s}` as ReminderKind;

/** How a nudge can reach each user (DMs on + Discord linked, email reminders on + a real address). */
function reachOf(users: User[]): Map<string, Reach> {
  const ids = users.map((u) => u.id);
  const linked = new Set(
    ids.length
      ? db
          .select({ userId: account.userId })
          .from(account)
          .where(and(inArray(account.userId, ids), eq(account.providerId, "discord")))
          .all()
          .map((a) => a.userId)
      : [],
  );
  const bot = discordEnabled();
  return new Map(
    users.map((u) => [
      u.id,
      {
        discord: bot && !u.isGuest && u.discordDms && linked.has(u.id),
        email: !u.isGuest && u.emailReminders && !isGuestEmail(u.email),
      },
    ]),
  );
}

/** Who still owes what for an event, step by step. Empty groups are left out. */
export function whoIsMissing(l: Lan): MissingGroup[] {
  const members = db
    .select({ u: user, role: clanMember.role })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(eq(clanMember.clanId, l.clanId ?? ""))
    .all()
    .filter((m) => m.role !== "pending")
    .map((m) => m.u);
  const rows = db.select().from(attendance).where(eq(attendance.lanId, l.id)).all();
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  // People with an answer who left the clan still count for their own steps.
  const extra = rows.filter((r) => !members.some((m) => m.id === r.userId)).map((r) => r.userId);
  const users = [...members, ...(extra.length ? db.select().from(user).where(inArray(user.id, extra)).all() : [])];
  const reach = reachOf(users);
  const seats = db.select().from(seat).where(eq(seat.lanId, l.id)).all();
  const seatOf = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s.label]));
  const nudges = db
    .select()
    .from(reminderLog)
    .where(and(eq(reminderLog.lanId, l.id), like(reminderLog.kind, "nudge_%")))
    .all();
  const nudgedAt = (uid: string, step: MissingStep) =>
    nudges.find((n) => n.userId === uid && n.kind === `nudge_${step}`)?.sentAt ?? null;

  const going = rows.filter((r) => r.status === "going");
  const goingIds = going.map((r) => r.userId);
  const withNick = new Set(
    goingIds.length
      ? db
          .select()
          .from(nickname)
          .where(inArray(nickname.userId, goingIds))
          .all()
          .filter((n) => (n.lanId === null && n.typeId === null) || n.lanId === l.id || (!!l.typeId && n.typeId === l.typeId))
          .map((n) => n.userId)
      : [],
  );

  const groups: Record<MissingStep, MissingPerson[]> = {
    interest: [],
    answer: [],
    unsure: [],
    ticket: [],
    nick: [],
    seat: [],
    book: [],
    confirm: [],
    assign: [],
  };
  const add = (step: MissingStep, userId: string, detail?: string) =>
    groups[step].push({ userId, reach: reach.get(userId) ?? { discord: false, email: false }, nudgedAt: nudgedAt(userId, step), detail });

  if (l.interestCheck) {
    // Phase 1: only the interest check matters, sign-up hasn't opened.
    const answered = new Set(
      db.select().from(lanInterest).where(eq(lanInterest.lanId, l.id)).all().map((i) => i.userId),
    );
    for (const m of members) if (!answered.has(m.id)) add("interest", m.id);
  } else {
    for (const m of members) {
      const a = byUser.get(m.id);
      if (!a) add("answer", m.id);
      else if (a.status === "maybe") add("unsure", m.id);
    }
    for (const r of rows) {
      if (r.status !== "going" && r.status !== "waitlist") continue;
      // Waitlisted people aren't chased for a ticket, but one they reported still needs confirming.
      if (!r.paid && !r.ticketBought && r.status === "going") add("ticket", r.userId);
      else if (!r.paid && r.ticketBought) add("confirm", r.userId);
    }
    for (const r of going) {
      if (!withNick.has(r.userId)) add("nick", r.userId);
      const label = seatOf.get(r.userId);
      if (seats.length > 0 && !label) {
        // Self pick: members take a seat once they have a ticket. Otherwise the leads assign.
        if (l.seatPicking && !l.seatsPublishedAt && (r.ticketBought || r.paid)) add("seat", r.userId);
        else if (!l.seatPicking || l.seatsPublishedAt) add("assign", r.userId);
      }
      if (label && l.seatsPublishedAt && l.externalPlanUrl && !r.seatBooked) add("book", r.userId, label);
    }
  }
  return (Object.keys(groups) as MissingStep[]).filter((s) => groups[s].length > 0).map((step) => ({ step, people: groups[step] }));
}

/** The nudge for one step, in the member's language. Short and friendly: it comes from a lead, not a robot deadline. */
function nudgeMessage(step: NudgeStep, l: Lan, u: User): Notice {
  const t = makeT(localeOf(u));
  const url = `${appUrl}/lans/${l.id}`;
  const by = (d: Date | null, key: "nudge.answerBy" | "nudge.decideBy" | "nudge.buyBy") =>
    d ? ` ${t(key, { date: fmtDate(d, t.locale) })}` : "";
  const hi = t("mail.hi", { name: u.firstName || u.name });
  const attButtons = [
    { type: 2, style: 3, label: t("nudge.going"), custom_id: `att:${l.id}:going` },
    { type: 2, style: 2, label: t("nudge.maybe"), custom_id: `att:${l.id}:maybe` },
    { type: 2, style: 4, label: t("nudge.declined"), custom_id: `att:${l.id}:declined` },
  ];
  const base = { kind: "reminder" as const, url, locale: t.locale };
  switch (step) {
    case "interest":
      return {
        ...base,
        subject: t("nudge.interest", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.interestText", { lan: l.name })}\n\n${url}`,
        buttons: [
          { type: 2, style: 3, label: t("nudge.yes"), custom_id: `int:${l.id}:yes` },
          { type: 2, style: 2, label: t("nudge.maybeShort"), custom_id: `int:${l.id}:maybe` },
          { type: 2, style: 4, label: t("nudge.no"), custom_id: `int:${l.id}:no` },
        ],
      };
    case "answer":
      return {
        ...base,
        subject: t("nudge.answer", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.answerText", { lan: l.name })}${by(l.signupDeadline, "nudge.answerBy")}\n\n${url}`,
        buttons: attButtons,
      };
    case "unsure":
      return {
        ...base,
        subject: t("nudge.unsure", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.unsureText", { lan: l.name })}${by(l.signupDeadline, "nudge.decideBy")}\n\n${url}`,
        buttons: attButtons,
      };
    case "ticket":
      return {
        ...base,
        subject: t("nudge.ticket", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.ticketText", { lan: l.name })}${l.ticketUrl ? ` ${t("nudge.buyHere", { url: l.ticketUrl })}` : ""}${by(l.paymentDueDate, "nudge.buyBy")} ${t("nudge.tickIt")}\n\n${url}`,
        buttons: l.ticketUrl ? [{ type: 2, style: 5, label: t("nudge.buyTicket"), url: l.ticketUrl }] : undefined,
      };
    case "nick":
      return {
        ...base,
        subject: t("nudge.nick", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.nickText", { lan: l.name })}\n\n${url}`,
      };
    case "seat":
      return {
        ...base,
        url: `${url}?tab=seats`,
        subject: t("nudge.seat", { lan: l.name }),
        text: `${hi}\n\n${t("nudge.seatText", { lan: l.name })}\n\n${url}?tab=seats`,
      };
  }
}

export type NudgeResult = { sent: number; skipped: number; unreachable: number };

/**
 * Nudges people about one step. Without `userIds` everyone still missing it
 * gets one. People nudged within the cooldown are skipped.
 */
export async function nudge(l: Lan, step: NudgeStep, userIds?: string[]): Promise<NudgeResult> {
  const group = whoIsMissing(l).find((g) => g.step === step);
  const now = Date.now();
  let targets = group?.people ?? [];
  if (userIds) targets = targets.filter((p) => userIds.includes(p.userId));
  const result: NudgeResult = { sent: 0, skipped: 0, unreachable: 0 };
  const users = new Map(
    targets.length
      ? db.select().from(user).where(inArray(user.id, targets.map((t) => t.userId))).all().map((u) => [u.id, u])
      : [],
  );
  for (const p of targets) {
    if (p.nudgedAt && now - p.nudgedAt.getTime() < NUDGE_COOLDOWN_MS) {
      result.skipped++;
      continue;
    }
    const u = users.get(p.userId);
    if (!u || (!p.reach.discord && !p.reach.email)) {
      result.unreachable++;
      continue;
    }
    const r = await notify(u, nudgeMessage(step, l, u)).catch(() => ({ email: false, dm: false }));
    // sendMail quietly skips guests; only count a channel the person can actually get.
    if (!(r.dm || (r.email && p.reach.email))) {
      result.unreachable++;
      continue;
    }
    db.insert(reminderLog)
      .values({ lanId: l.id, userId: u.id, kind: nudgeKind(step) })
      .onConflictDoUpdate({ target: [reminderLog.lanId, reminderLog.userId, reminderLog.kind], set: { sentAt: new Date() } })
      .run();
    result.sent++;
  }
  return result;
}
