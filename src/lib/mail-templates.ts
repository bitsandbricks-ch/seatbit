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
import { isLocale, type Locale } from "../i18n/config";
import { lanStart } from "./format";
import { appUrl, deliverMail } from "./mail";
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
  /** German defaults; fact labels are translated in mail-fill. */
  de: TemplateParts;
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
const reminderNoteDe = "Du bekommst Erinnerungen, weil sie in deinem Seatbit-Profil eingeschaltet sind.";
const interestNoteDe = "Du bekommst diese Mails, weil dich diese Art Event interessiert. Ändern kannst du das in deinem Seatbit-Profil.";

export const MAIL_TEMPLATES = [
  {
    id: "guestInvite",
    title: "Guest invite",
    when: "A lead adds a guest with an email address, or presses Send invite.",
    vars: {
      firstName: "The guest's first name",
      clan: "Clan name (also shown in the header)",
      inviter: "Lead who sent it",
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
    de: {
      subject: "{inviter} hat dich bei {clan} auf Seatbit eingetragen",
      body: "{inviter} hat dich bei {clan} auf Seatbit eingetragen. Dort planen wir LAN-Partys zusammen: wer kommt, Tickets und Plätze.\n\nMelde dich mit Discord an, um deinen Platz zu übernehmen. Wenn dein Discord-Konto diese E-Mail-Adresse nutzt, reicht die Anmeldung.",
      button: "Meinen Platz übernehmen",
      note: "Nicht du, oder kein Interesse? Ignoriere diese Mail einfach.",
    },
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
    de: {
      subject: "Kommst du an {lan}? Entscheide dich bis {deadline}",
      body: "Du hast noch nicht gesagt, ob du an {lan} kommst. Gib uns bitte bis {deadline} Bescheid.",
      button: "Jetzt antworten",
      note: reminderNoteDe,
    },
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
    de: {
      subject: "Kauf dein Ticket für {lan} bis {deadline}",
      body: "Du kommst an {lan}, hast dein Ticket aber noch nicht als gekauft markiert. Kauf es bitte bis {deadline} und hake es dann in deiner Checkliste ab.",
      button: "Meine Checkliste öffnen",
      note: reminderNoteDe,
    },
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
    de: {
      subject: "{lan} beginnt bald",
      body: "{lan} beginnt am {start}. Bis bald!",
      button: "Event-Details",
      note: reminderNoteDe,
    },
  },
  {
    id: "seatsPublished",
    title: "Seat plan final",
    when: "A lead finalizes the seat plan and ticks \"Tell everyone coming their seat\".",
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
    body: "The leads finalized the seat plan for {lan}. {seatInfo}",
    button: "See the seat map",
    note: "",
    de: {
      subject: "Der Sitzplan für {lan} steht",
      body: "Die Leads haben den Sitzplan für {lan} festgelegt. {seatInfo}",
      button: "Sitzplan ansehen",
      note: "",
    },
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
    de: {
      subject: "Du bist dabei: {lan}",
      body: "Ein Platz ist frei geworden und du bist von der Warteliste nachgerückt: Du kommst an {lan}.",
      button: "Event-Details",
      note: "",
    },
  },
  {
    id: "eventPublished",
    title: "New event",
    when: "A lead publishes an event (or it goes live at its scheduled time), to members interested in that kind of event.",
    vars: { ...lanVars, deadline: "Answer deadline (empty if not set)" },
    facts: [...eventFacts, ["Answer by", "{deadline}"]],
    subject: "New event: {lan}",
    body: "{clan} is going to {lan}. Are you coming? Let us know in Seatbit.",
    button: "Answer now",
    note: "You get these because you're interested in this kind of event. Change it in your Seatbit profile.",
    de: {
      subject: "Neues Event: {lan}",
      body: "{clan} geht an {lan}. Kommst du mit? Sag es uns in Seatbit.",
      button: "Jetzt antworten",
      note: interestNoteDe,
    },
  },
  {
    id: "interestCheck",
    title: "Interest check",
    when: "A lead publishes an event that starts with an interest check.",
    vars: lanVars,
    facts: eventFacts,
    subject: "Would you come to {lan}?",
    body: "{clan} is thinking about going to {lan}. Would you come? Tell us, so we know whether it's worth getting spots. Nothing is binding yet: sign-up comes later.",
    button: "I'm interested / not",
    note: "You get these because you're interested in this kind of event. Change it in your Seatbit profile.",
    de: {
      subject: "Würdest du an {lan} kommen?",
      body: "{clan} überlegt, an {lan} zu gehen. Würdest du kommen? Sag es uns, damit wir wissen, ob es sich lohnt, Plätze zu holen. Noch ist nichts verbindlich: Die Anmeldung kommt später.",
      button: "Interessiert / nicht",
      note: interestNoteDe,
    },
  },
  {
    id: "signupOpen",
    title: "Sign-up open",
    when: "A lead ends the interest check and opens sign-up.",
    vars: { ...lanVars, deadline: "Answer deadline (empty if not set)" },
    facts: [...eventFacts, ["Answer by", "{deadline}"]],
    subject: "We're going to {lan}: sign up now",
    body: "It's decided: {clan} is going to {lan}. Sign-up is open now, so say if you're coming.",
    button: "Sign up",
    note: "",
    de: {
      subject: "Wir gehen an {lan}: jetzt anmelden",
      body: "Es ist entschieden: {clan} geht an {lan}. Die Anmeldung ist jetzt offen, also sag, ob du kommst.",
      button: "Anmelden",
      note: "",
    },
  },
  {
    id: "eventCancelled",
    title: "Event cancelled",
    when: "A lead cancels an event, to everyone who answered.",
    vars: { ...lanVars, reason: "Why, as the lead wrote it (empty if none)" },
    facts: [...eventFacts, ["Why", "{reason}"]],
    subject: "{lan} is cancelled",
    body: "The leads cancelled {lan}. Sorry about that!",
    button: "Event page",
    note: "",
    de: {
      subject: "{lan} ist abgesagt",
      body: "Die Leads haben {lan} abgesagt. Tut uns leid!",
      button: "Zur Event-Seite",
      note: "",
    },
  },
  {
    id: "eventNews",
    title: "News from the leads",
    when: "A lead posts news on an event, to everyone coming, unsure or on the waitlist.",
    vars: { ...lanVars, news: "The news text", author: "Lead who wrote it" },
    facts: eventFacts,
    subject: "{lan}: news from {author}",
    body: "{news}",
    button: "Event page",
    note: "",
    de: {
      subject: "{lan}: News von {author}",
      body: "{news}",
      button: "Zur Event-Seite",
      note: "",
    },
  },
] as const satisfies MailTemplate[];

export type MailTemplateId = (typeof MAIL_TEMPLATES)[number]["id"];

export function templateDef(id: string): MailTemplate {
  const t = MAIL_TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown mail template ${id}`);
  return t;
}

// English keeps the original key so overrides saved before languages existed still apply.
const key = (id: string, part: Part, loc: Locale) => (loc === "en" ? `mailtpl.${id}.${part}` : `mailtpl.${id}.${part}.${loc}`);

/** A template's built-in text in a language. */
export function defaultParts(id: string, loc: Locale): TemplateParts {
  const def = templateDef(id);
  const src = loc === "en" ? def : def[loc];
  return { subject: src.subject, body: src.body, button: src.button, note: src.note };
}

/** Saved overrides, by template id and language. */
export function savedTemplates() {
  const out = new Map<string, Partial<Record<Locale, Partial<Record<Part, string>>>> & { updatedAt?: Date }>();
  for (const r of db.select().from(appSetting).where(like(appSetting.key, "mailtpl.%")).all()) {
    const [, id, part, loc = "en"] = r.key.split(".");
    if (!isLocale(loc)) continue;
    const e = out.get(id) ?? {};
    const parts = (e[loc] ??= {});
    if ((PARTS as readonly string[]).includes(part)) parts[part as Part] = r.value;
    if (!e.updatedAt || r.updatedAt > e.updatedAt) e.updatedAt = r.updatedAt;
    out.set(id, e);
  }
  return out;
}

/** The template's current parts in a language: the saved version, else the default. */
export function getTemplate(id: string, loc: Locale = "en"): TemplateParts {
  const def = defaultParts(id, loc);
  const saved = savedTemplates().get(id)?.[loc];
  return {
    subject: saved?.subject ?? def.subject,
    body: saved?.body ?? def.body,
    button: saved?.button ?? def.button,
    note: saved?.note ?? def.note,
  };
}

/** Saves a template in one language; a part equal to its default removes the override. */
export function saveTemplate(id: string, parts: TemplateParts, userId: string | null, loc: Locale = "en") {
  const def = defaultParts(id, loc);
  for (const part of PARTS) {
    let value = parts[part].replace(/\r\n/g, "\n").trim();
    if (part !== "body") value = value.replace(/\s*\n\s*/g, " ");
    const k = key(id, part, loc);
    if (value === def[part] || (!value && part !== "note")) db.delete(appSetting).where(eq(appSetting.key, k)).run();
    else
      db.insert(appSetting)
        .values({ key: k, value, encrypted: false, updatedBy: userId, updatedAt: new Date() })
        .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedBy: userId, updatedAt: new Date() } })
        .run();
  }
}

export function resetTemplate(id: string, loc: Locale = "en") {
  templateDef(id);
  for (const part of PARTS) db.delete(appSetting).where(eq(appSetting.key, key(id, part, loc))).run();
}

/** Subject, HTML and plain text for one recipient, in their language. */
export function renderTemplate(id: MailTemplateId, vars: Vars, loc: Locale = "en") {
  return buildMail(getTemplate(id, loc), templateDef(id).facts, vars, { appUrl, locale: loc });
}

/** Renders a template and sends it (HTML with a plain-text part). `test` marks the subject for admin test sends. */
export async function sendTemplate(to: string, id: MailTemplateId, vars: Vars, loc: Locale = "en", opts: { test?: boolean } = {}) {
  const m = renderTemplate(id, vars, loc);
  await deliverMail(to, { ...m, subject: opts.test ? `[Test] ${m.subject}` : m.subject });
}

/** The placeholders every event mail has. */
export function eventMailVars(
  l: { id: string; name: string; startsAt: Date; endsAt: Date; dateTbd?: boolean; dateHint?: string; location: string; clanId: string | null },
  u: { firstName: string; name: string },
  loc: Locale = "en",
) {
  const c = l.clanId ? db.select({ name: schema.clan.name }).from(schema.clan).where(eq(schema.clan.id, l.clanId)).get() : null;
  return {
    firstName: u.firstName || u.name,
    clan: c?.name ?? "",
    lan: l.name,
    start: lanStart(l, loc),
    location: l.location,
    link: `${appUrl}/lans/${l.id}`,
  };
}
