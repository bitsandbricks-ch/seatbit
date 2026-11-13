import { fmtDate, lanStart } from "./format";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { getDisplayNames } from "./lans";
import { appUrl } from "./mail";
import { makeT, type T } from "../i18n/translate";

const { attendance, user, clanMember } = schema;

export const fmtWhen = fmtDate;

export const lanLink = (l: Lan) => `${appUrl}/lans/${l.id}`;

export type LanSummary = {
  going: { userId: string; name: string }[];
  maybe: { userId: string; name: string }[];
  waitlist: { userId: string; name: string }[];
  /** Members who haven't answered or said maybe. */
  undecided: User[];
  /** Attendees coming without a ticket (not the waitlist: they have no spot yet). */
  noTicket: User[];
  /** Going without a ticket (neither reported nor confirmed). */
  goingNoTicket: number;
  /** Going with a seat, and how many of them booked it on the event site. */
  seated: number;
  booked: number;
};

/** Who is coming, who hasn't answered and who still needs a ticket, with full display names (Mike "Reyki" Keller). */
export async function lanSummary(l: Lan): Promise<LanSummary> {
  // Only the LAN's clan counts (pending join requests don't).
  const members = db
    .select({ u: user })
    .from(user)
    .innerJoin(clanMember, eq(clanMember.userId, user.id))
    .where(and(eq(clanMember.clanId, l.clanId ?? ""), ne(clanMember.role, "pending")))
    .all()
    .map((r) => r.u);
  const rows = db.select().from(attendance).where(eq(attendance.lanId, l.id)).all();
  const names = await getDisplayNames(l.id, members.map((m) => m.id));
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  const withName = (status: string) =>
    rows
      .filter((r) => r.status === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ userId: r.userId, name: names.get(r.userId) ?? "?" }));
  const seatedIds = new Set(
    db
      .select({ userId: schema.seat.userId })
      .from(schema.seat)
      .where(eq(schema.seat.lanId, l.id))
      .all()
      .map((s) => s.userId),
  );
  const goingRows = rows.filter((r) => r.status === "going");
  const seatedRows = l.seatsPublishedAt && l.externalPlanUrl ? goingRows.filter((r) => seatedIds.has(r.userId)) : [];
  return {
    goingNoTicket: goingRows.filter((r) => !r.paid && !r.ticketBought).length,
    seated: seatedRows.length,
    booked: seatedRows.filter((r) => r.seatBooked).length,
    going: withName("going").sort((a, b) => a.name.localeCompare(b.name)),
    maybe: withName("maybe").sort((a, b) => a.name.localeCompare(b.name)),
    // In line order, so the post shows who's next.
    waitlist: rows
      .filter((r) => r.status === "waitlist")
      .sort((a, b) => +(a.waitlistedAt ?? a.createdAt) - +(b.waitlistedAt ?? b.createdAt) || +a.createdAt - +b.createdAt)
      .map((r) => ({ userId: r.userId, name: names.get(r.userId) ?? "?" })),
    undecided: members.filter((m) => {
      const a = byUser.get(m.id);
      return !a || a.status === "maybe";
    }),
    noTicket: members.filter((m) => {
      const a = byUser.get(m.id);
      return a && a.status === "going" && !a.paid && !a.ticketBought;
    }),
  };
}

/** Key facts of a LAN as "label: value" lines (empty values left out). */
export function lanFacts(l: Lan, t: T = makeT("en")): [string, string][] {
  const loc = t.locale;
  const facts: [string, string][] = [
    [t("bot.when"), l.dateTbd ? lanStart(l, loc) : `${fmtWhen(l.startsAt, loc)} – ${fmtWhen(l.endsAt, loc)}`],
    [t("bot.where"), l.location],
    [t("bot.ticket"), [l.price, l.ticketUrl].filter(Boolean).join(" · ")],
    [t("notice.field.answerBy"), l.signupDeadline ? fmtWhen(l.signupDeadline, loc) : ""],
    [t("notice.field.ticketBy"), l.paymentDueDate ? fmtWhen(l.paymentDueDate, loc) : ""],
  ];
  return facts.filter(([, v]) => v);
}

export type ChatReminderKind = "signup" | "payment" | "event";

/** Plain-text messages for pasting into WhatsApp (uses *bold*, which WhatsApp renders). */
export async function whatsappTexts(l: Lan, t: T = makeT("en")) {
  const loc = t.locale;
  const s = await lanSummary(l);
  const link = lanLink(l);
  const spots = l.capacity
    ? ` ${t("whatsapp.spotsTaken", { going: s.going.length, capacity: l.capacity })}`
    : ` ${t("whatsapp.going", { count: s.going.length })}`;
  const facts = lanFacts(l, t)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const goingNames = s.going.map((g) => g.name).join(", ") || t("whatsapp.nobody");

  const announce = [
    `🎮 *${l.name}*`,
    l.description ? l.description.trim().slice(0, 500) : null,
    facts,
    `${t("whatsapp.whoIsIn")}${spots}: ${goingNames}`,
    t("whatsapp.sayIfComing", { link }),
  ]
    .filter(Boolean)
    .join("\n\n");

  const texts: { kind: "announce" | ChatReminderKind; label: string; text: string }[] = [
    { kind: "announce", label: t("whatsapp.announcement"), text: announce },
  ];
  if (l.signupDeadline) {
    texts.push({
      kind: "signup",
      label: t("whatsapp.answerReminder"),
      text: `⏰ *${l.name}*: ${t("whatsapp.answerText", { date: `*${fmtWhen(l.signupDeadline, loc)}*`, count: s.undecided.length })}\n\n${t("whatsapp.goingSoFar")}${spots}: ${goingNames}\n\n${link}`,
    });
  }
  if (l.paymentDueDate) {
    texts.push({
      kind: "payment",
      label: t("whatsapp.ticketReminder"),
      text: `🎟️ *${l.name}*: ${t("whatsapp.ticketText", { date: `*${fmtWhen(l.paymentDueDate, loc)}*${l.ticketUrl ? ` (${l.ticketUrl})` : ""}`, count: s.noTicket.length })}\n\n${link}`,
    });
  }
  texts.push({
    kind: "event",
    label: t("whatsapp.startsSoon"),
    text: `🚀 *${l.name}* ${t(l.location ? "whatsapp.startsAt" : "whatsapp.starts", { date: fmtWhen(l.startsAt, loc), location: l.location })} ${t("whatsapp.details", { link })}`,
  });
  return texts;
}
