/**
 * Email templates that platform admins can edit at /admin/settings?tab=templates.
 *
 * Each template has a built-in default. An edited subject or body is saved in the
 * app_setting table under `mailtpl.<id>.subject` / `mailtpl.<id>.body`; removing it
 * brings the default back.
 *
 * Placeholders are written as {name}. A line whose placeholders are all empty is
 * left out, so optional details (price, ticket shop, location) need no conditionals.
 */
import { eq, like } from "drizzle-orm";
import { db, schema } from "../db";
import { sendMail } from "./mail";
import { fill } from "./mail-fill";

export { fill, PREVIEW_VARS } from "./mail-fill";

const { appSetting } = schema;

export interface MailTemplate {
  id: string;
  title: string;
  /** When the mail goes out. */
  when: string;
  vars: Record<string, string>; // placeholder -> what it is (also the preview example)
  subject: string;
  body: string;
}

const lanVars = {
  firstName: "Their first name",
  lan: "Event name",
  start: "Start date and time",
  location: "Venue (empty if not set)",
  link: "Link to the event in Seatbit",
};

export const MAIL_TEMPLATES = [
  {
    id: "guestInvite",
    title: "Guest invite",
    when: "An orga adds a guest with an email address, or presses Send invite.",
    vars: {
      firstName: "The guest's first name",
      clan: "Clan name",
      inviter: "Orga who sent it",
      events: "Events they're signed up for (empty if none)",
      link: "Personal claim link",
    },
    subject: "{inviter} added you to {clan} on Seatbit",
    body:
      "Hi {firstName},\n\n{inviter} added you to {clan} on Seatbit, where we plan LAN parties together: who's coming, tickets and seats.\n\nYou're already signed up for: {events}\n\nSign in with Discord through this link to take over your spot:\n{link}\n\nIf your Discord account uses this email address, signing in at Seatbit is enough.",
  },
  {
    id: "reminderSignup",
    title: "Reminder: are you coming?",
    when: "Before the answer deadline, to members who haven't answered or said unsure.",
    vars: { ...lanVars, deadline: "Answer deadline" },
    subject: "Are you coming to {lan}? Decide by {deadline}",
    body:
      "Hi {firstName},\n\nyou haven't confirmed yet whether you're coming to {lan} ({start}).\nVenue: {location}\n\nPlease let us know by {deadline}:\n{link}",
  },
  {
    id: "reminderPayment",
    title: "Reminder: buy your ticket",
    when: "Before the ticket deadline, to people coming who haven't reported a ticket.",
    vars: { ...lanVars, deadline: "Ticket deadline", price: "Ticket price (empty if not set)", ticketUrl: "Ticket shop link (empty if not set)" },
    subject: "Buy your ticket for {lan} by {deadline}",
    body:
      "Hi {firstName},\n\nyou're going to {lan}, but haven't marked your ticket as bought yet. Please buy it by {deadline}.\nPrice: {price}\nTicket shop: {ticketUrl}\n\nThen tick it off in your checklist: {link}",
  },
  {
    id: "reminderEvent",
    title: "Reminder: event starts soon",
    when: "The day before the event, to everyone coming.",
    vars: { ...lanVars, seat: "Their seat (empty if none)" },
    subject: "{lan} starts soon",
    body: "Hi {firstName},\n\n{lan} starts on {start}. See you there!\nVenue: {location}\nYour seat: {seat}\n\nAll details: {link}",
  },
  {
    id: "seatsPublished",
    title: "Seat plan published",
    when: "An orga publishes the seat plan and ticks \"notify\".",
    vars: { ...lanVars, seat: "Their seat (empty if none)", seatInfo: "\"You're sitting at F3.\" or a note that they have no seat yet" },
    subject: "Seat plan for {lan} is out",
    body: "Hi {firstName},\n\nthe seat plan for {lan} is published. {seatInfo}\n\n{link}",
  },
  {
    id: "waitlistPromoted",
    title: "Moved up from the waitlist",
    when: "A spot opens and someone on the waitlist moves to coming.",
    vars: lanVars,
    subject: "You're in: {lan}",
    body: "Hi {firstName},\n\na spot opened up and you moved from the waitlist to \"coming\" for {lan}.\n\nDetails: {link}",
  },
] as const satisfies MailTemplate[];

export type MailTemplateId = (typeof MAIL_TEMPLATES)[number]["id"];

export function templateDef(id: string): MailTemplate {
  const t = MAIL_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown mail template ${id}`);
  return t;
}

const key = (id: string, part: "subject" | "body") => `mailtpl.${id}.${part}`;

/** Saved overrides, by template id. */
export function savedTemplates() {
  const out = new Map<string, { subject?: string; body?: string; updatedAt?: Date }>();
  for (const r of db.select().from(appSetting).where(like(appSetting.key, "mailtpl.%")).all()) {
    const [, id, part] = r.key.split(".");
    const e = out.get(id) ?? {};
    if (part === "subject" || part === "body") e[part] = r.value;
    if (!e.updatedAt || r.updatedAt > e.updatedAt) e.updatedAt = r.updatedAt;
    out.set(id, e);
  }
  return out;
}

/** The template's current subject and body: the saved version, else the default. */
export function getTemplate(id: MailTemplateId) {
  const def = templateDef(id);
  const saved = savedTemplates().get(id);
  return { subject: saved?.subject ?? def.subject, body: saved?.body ?? def.body };
}

/** Saves a template; a part equal to the default (or empty) removes the override. */
export function saveTemplate(id: string, subject: string, body: string, userId: string | null) {
  const def = templateDef(id);
  for (const [part, value, fallback] of [
    ["subject", subject.replace(/\s*\n\s*/g, " ").trim(), def.subject],
    ["body", body.replace(/\r\n/g, "\n").trim(), def.body],
  ] as const) {
    const k = key(id, part);
    if (!value || value === fallback) db.delete(appSetting).where(eq(appSetting.key, k)).run();
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

export function renderTemplate(id: MailTemplateId, vars: Record<string, string | null | undefined>) {
  const t = getTemplate(id);
  return { subject: fill(t.subject, vars).replace(/\n+/g, " "), text: fill(t.body, vars) };
}

/** Renders a template and sends it. */
export async function sendTemplate(to: string, id: MailTemplateId, vars: Record<string, string | null | undefined>) {
  const m = renderTemplate(id, vars);
  await sendMail(to, m.subject, m.text);
}

