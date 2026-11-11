/**
 * Email templates that platform admins can edit at /admin/settings?tab=templates.
 *
 * Every mail has the same layout (see mail-fill.ts): greeting, text, a facts box,
 * a button and a small note. Admins edit the subject, text, button label and note;
 * the facts rows are fixed per template and drop out when their value is empty.
 * An edited part is saved in app_setting as `mailtpl.<id>.<part>`; removing it brings
 * the default back.
 *
 * Placeholders are written as {name}. A line whose placeholders are all empty is
 * left out, so optional details need no conditionals.
 */
import { eq, like } from "drizzle-orm";
import { db, schema } from "../db";
import { fmtDate } from "./format";
import { appUrl, sendMail } from "./mail";
import { type FactRow, type TemplateParts, type Vars, buildMail } from "./mail-fill";

export { fill, PREVIEW_VARS, buildMail } from "./mail-fill";

const { appSetting } = schema;

export interface MailTemplate extends TemplateParts {
  id: string;
  title: string;
  /** When the mail goes out. */
  when: string;
  vars: Record<string, string>; // placeholder -> what it is
  facts: readonly FactRow[];
}

export const PARTS = ["subject", "body", "button", "note"] as const;
export type Part = (typeof PARTS)[number];

const lanVars = {
  firstName: "Their first name",
  clan: "Clan name (also shown in the header)",
  lan: "Event name",
  start: "Start date and time",
  location: "Venue (empty if not set)",
  link: "Link to the event (the button goes there)",
};
const eventFacts: FactRow[] = [
  ["Event", "{lan}"],
  ["When", "{start}"],
  ["Venue", "{location}"],
];
const reminderNote = "You get reminders because they're on in your Seatbit profile.";

export const MAIL_TEMPLATES = [
  {
    id: "guestInvite",
    title: "Guest invite",
    when: "An orga adds a guest with an email address, or presses Send invite.",
    vars: {
      firstName: "The guest's first name",
      clan: "Clan name (also shown in the header)",
      inviter: "Orga who sent it",
      events: "Events they're signed up for (empty if none)",
      link: "Personal claim link (the button goes there)",
    },
    facts: [
      ["Clan", "{clan}"],
      ["Signed up for", "{events}"],
    ],
    subject: "{inviter} added you to {clan} on Seatbit",
    body:
      "{inviter} added you to {clan} on Seatbit, where we plan LAN parties together: who's coming, tickets and seats.\n\nSign in with Discord to take over your spot. If your Discord account uses this email address, signing in is all it takes.",
    button: "Take over my spot",
    note: "Not you, or not interested? Just ignore this mail.",
  },
  {
    id: "reminderSignup",
    title: "Reminder: are you coming?",
    when: "Before the answer deadline, to members who haven't answered or said unsure.",
    vars: { ...lanVars, deadline: "Answer deadline" },
    facts: [...eventFacts, ["Answer by", "{deadline}"]],
    subject: "Are you coming to {lan}? Decide by {deadline}",
    body: "You haven't said yet whether you're coming to {lan}. Please let us know by {deadline}.",
    button: "Answer now",
    note: reminderNote,
  },
  {
    id: "reminderPayment",
    title: "Reminder: buy your ticket",
    when: "Before the ticket deadline, to people coming who haven't reported a ticket.",
    vars: {
      ...lanVars,
      deadline: "Ticket deadline",
      price: "Ticket price (empty if not set)",
      ticketUrl: "Ticket shop link (empty if not set)",
    },
    facts: [
      ["Event", "{lan}"],
      ["Buy by", "{deadline}"],
      ["Price", "{price}"],
      ["Ticket shop", "{ticketUrl}"],
    ],
    subject: "Buy your ticket for {lan} by {deadline}",
    body: "You're coming to {lan}, but haven't marked your ticket as bought yet. Please buy it by {deadline}, then tick it off in your checklist.",
    button: "Open my checklist",
    note: reminderNote,
  },
  {
    id: "reminderEvent",
    title: "Reminder: event starts soon",
    when: "The day before the event, to everyone coming.",
    vars: { ...lanVars, seat: "Their seat (empty if none or the plan isn't final)" },
    facts: [...eventFacts, ["Your seat", "{seat}", true]],
    subject: "{lan} starts soon",
    body: "{lan} starts on {start}. See you there!",
    button: "Event details",
    note: reminderNote,
  },
  {
    id: "seatsPublished",
    title: "Seat plan final",
    when: "An orga finalizes the seat plan and ticks \"Tell everyone coming their seat\".",
    vars: {
      ...lanVars,
      seat: "Their seat (empty if none)",
      seatInfo: "\"You're sitting at F3.\" or a note that they have no seat yet",
    },
    facts: [
      ["Event", "{lan}"],
      ["Your seat", "{seat}", true],
    ],
    subject: "Seat plan for {lan} is final",
    body: "The orgas finalized the seat plan for {lan}. {seatInfo}",
    button: "See the seat map",
    note: "",
  },
  {
    id: "waitlistPromoted",
    title: "Moved up from the waitlist",
    when: "A spot opens and someone on the waitlist moves to coming.",
    vars: lanVars,
    facts: eventFacts,
    subject: "You're in: {lan}",
    body: "A spot opened up and you moved from the waitlist to coming for {lan}.",
    button: "Event details",
    note: "",
  },
] as const satisfies MailTemplate[];

export type MailTemplateId = (typeof MAIL_TEMPLATES)[number]["id"];

export function templateDef(id: string): MailTemplate {
  const t = MAIL_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown mail template ${id}`);
  return t;
}

const key = (id: string, part: Part) => `mailtpl.${id}.${part}`;

/** Saved overrides, by template id. */
export function savedTemplates() {
  const out = new Map<string, Partial<Record<Part, string>> & { updatedAt?: Date }>();
  for (const r of db.select().from(appSetting).where(like(appSetting.key, "mailtpl.%")).all()) {
    const [, id, part] = r.key.split(".");
    const e = out.get(id) ?? {};
    if ((PARTS as readonly string[]).includes(part)) e[part as Part] = r.value;
    if (!e.updatedAt || r.updatedAt > e.updatedAt) e.updatedAt = r.updatedAt;
    out.set(id, e);
  }
  return out;
}

/** The template's current parts: the saved version, else the default. */
export function getTemplate(id: string): TemplateParts {
  const def = templateDef(id);
  const saved = savedTemplates().get(id);
  return {
    subject: saved?.subject ?? def.subject,
    body: saved?.body ?? def.body,
    button: saved?.button ?? def.button,
    note: saved?.note ?? def.note,
  };
}

/** Saves a template; a part equal to its default removes the override. */
export function saveTemplate(id: string, parts: TemplateParts, userId: string | null) {
  const def = templateDef(id);
  for (const part of PARTS) {
    let value = parts[part].replace(/\r\n/g, "\n").trim();
    if (part !== "body") value = value.replace(/\s*\n\s*/g, " ");
    const k = key(id, part);
    if (value === def[part] || (!value && part !== "note")) db.delete(appSetting).where(eq(appSetting.key, k)).run();
    else
      db.insert(appSetting)
        .values({ key: k, value, encrypted: false, updatedBy: userId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedBy: userId, updatedAt: new Date() } })
        .run();
  }
}

export function resetTemplate(id: string) {
  templateDef(id);
  db.delete(appSetting).where(like(appSetting.key, `mailtpl.${id}.%`)).run();
}

/** Subject, HTML and plain text for one recipient. */
export function renderTemplate(id: MailTemplateId, vars: Vars) {
  return buildMail(getTemplate(id), templateDef(id).facts, vars, { appUrl });
}

/** Renders a template and sends it (HTML with a plain-text part). */
export async function sendTemplate(to: string, id: MailTemplateId, vars: Vars) {
  const m = renderTemplate(id, vars);
  await sendMail(to, m.subject, m.text, m.html);
}

/** The placeholders every event mail has. */
export function eventMailVars(
  l: { id: string; name: string; startsAt: Date; location: string; clanId: string | null },
  u: { firstName: string; name: string },
) {
  const c = l.clanId ? db.select({ name: schema.clan.name }).from(schema.clan).where(eq(schema.clan.id, l.clanId)).get() : null;
  return {
    firstName: u.firstName || u.name,
    clan: c?.name ?? "",
    lan: l.name,
    start: fmtDate(l.startsAt),
    location: l.location,
    link: `${appUrl}/lans/${l.id}`,
  };
}
