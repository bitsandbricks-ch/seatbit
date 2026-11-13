import { fmtDate, lanStart } from "./format";
import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { getDisplayNames } from "./lans";
import { appUrl } from "./mail";

const { attendance, user, clanMember } = schema;

export const fmtWhen = fmtDate;

export const lanLink = (l: Lan) => `${appUrl}/lans/${l.id}`;

export type LanSummary = {
  going: { userId: string; name: string }[];
  maybe: { userId: string; name: string }[];
  waitlist: { userId: string; name: string }[];
  /** Members who haven't answered or said maybe. */
  undecided: User[];
  /** Attendees (going or waitlist) without a ticket. */
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
      return a && (a.status === "going" || a.status === "waitlist") && !a.paid && !a.ticketBought;
    }),
  };
}

/** Key facts of a LAN as "label: value" lines (empty values left out). */
export function lanFacts(l: Lan): [string, string][] {
  const facts: [string, string][] = [
    ["When", l.dateTbd ? lanStart(l) : `${fmtWhen(l.startsAt)} – ${fmtWhen(l.endsAt)}`],
    ["Where", l.location],
    ["Ticket", [l.price, l.ticketUrl].filter(Boolean).join(" · ")],
    ["Answer by", l.signupDeadline ? fmtWhen(l.signupDeadline) : ""],
    ["Ticket by", l.paymentDueDate ? fmtWhen(l.paymentDueDate) : ""],
  ];
  return facts.filter(([, v]) => v);
}

export type ChatReminderKind = "signup" | "payment" | "event";

/** Plain-text messages for pasting into WhatsApp (uses *bold*, which WhatsApp renders). */
export async function whatsappTexts(l: Lan) {
  const s = await lanSummary(l);
  const link = lanLink(l);
  const spots = l.capacity ? ` (${s.going.length}/${l.capacity} spots taken)` : ` (${s.going.length} going)`;
  const facts = lanFacts(l)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const announce = [
    `🎮 *${l.name}*`,
    l.description ? l.description.trim().slice(0, 500) : null,
    facts,
    `Who's in so far${spots}: ${s.going.map((g) => g.name).join(", ") || "nobody yet"}`,
    `Say if you're coming: ${link}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const texts: { kind: "announce" | ChatReminderKind; label: string; text: string }[] = [
    { kind: "announce", label: "Announcement", text: announce },
  ];
  if (l.signupDeadline) {
    texts.push({
      kind: "signup",
      label: "Answer reminder",
      text: `⏰ *${l.name}*: please say if you're coming by *${fmtWhen(l.signupDeadline)}*. ${s.undecided.length} of us haven't answered yet.\n\nGoing so far${spots}: ${s.going.map((g) => g.name).join(", ") || "nobody yet"}\n\n${link}`,
    });
  }
  if (l.paymentDueDate) {
    texts.push({
      kind: "payment",
      label: "Ticket reminder",
      text: `🎟️ *${l.name}*: buy your ticket by *${fmtWhen(l.paymentDueDate)}*${l.ticketUrl ? ` (${l.ticketUrl})` : ""} and tick it off in Seatbit. ${s.noTicket.length} still open.\n\n${link}`,
    });
  }
  texts.push({
    kind: "event",
    label: "Starts soon",
    text: `🚀 *${l.name}* starts ${fmtWhen(l.startsAt)}${l.location ? ` at ${l.location}` : ""}. Details and your seat: ${link}`,
  });
  return texts;
}
