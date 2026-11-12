import { fmtDate } from "./format";
import { and, eq, gt, isNotNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, ReminderKind, User } from "@/db/schema";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { eventMailVars, renderTemplate } from "./mail-templates";

const { lan, user, attendance, reminderLog } = schema;
const DAY = 24 * 60 * 60 * 1000;

const fmt = fmtDate;

function message(kind: ReminderKind, l: Lan, u: User) {
  const vars = eventMailVars(l, u);
  switch (kind) {
    case "signup":
      return renderTemplate("reminderSignup", { ...vars, deadline: fmt(l.signupDeadline!) });
    case "payment":
      return renderTemplate("reminderPayment", {
        ...vars,
        deadline: fmt(l.paymentDueDate!),
        price: l.price,
        ticketUrl: l.ticketUrl,
      });
    case "event": {
      const s = db
        .select({ label: schema.seat.label })
        .from(schema.seat)
        .where(and(eq(schema.seat.lanId, l.id), eq(schema.seat.userId, u.id)))
        .get();
      return renderTemplate("reminderEvent", { ...vars, seat: l.seatsPublishedAt ? s?.label : "" });
    }
    default:
      return { subject: l.name, text: vars.link };
  }
}

/** Who a reminder kind applies to for a LAN. */
function recipients(kind: ReminderKind, l: Lan): User[] {
  const members = db
    .select({ u: user })
    .from(user)
    .innerJoin(schema.clanMember, eq(schema.clanMember.userId, user.id))
    // Everyone in the clan: notify() mails only those with email reminders on and
    // DMs those with Discord DMs on.
    .where(and(eq(schema.clanMember.clanId, l.clanId ?? ""), ne(schema.clanMember.role, "pending")))
    .all()
    .map((r) => r.u);
  const rows = db.select().from(attendance).where(eq(attendance.lanId, l.id)).all();
  const byUser = new Map(rows.map((r) => [r.userId, r]));
  switch (kind) {
    case "signup":
      return members.filter((m) => {
        const a = byUser.get(m.id);
        return !a || a.status === "maybe";
      });
    case "payment":
      return members.filter((m) => {
        const a = byUser.get(m.id);
        return a && (a.status === "going" || a.status === "waitlist") && !a.paid && !a.ticketBought;
      });
    case "event":
      return members.filter((m) => byUser.get(m.id)?.status === "going");
    default:
      return [];
  }
}

async function send(kind: ReminderKind, l: Lan, users: User[], dedupe: boolean) {
  let sent = 0;
  for (const u of users) {
    if (dedupe) {
      const already = db
        .select()
        .from(reminderLog)
        .where(
          and(
            eq(reminderLog.lanId, l.id),
            eq(reminderLog.userId, u.id),
            eq(reminderLog.kind, kind),
          ),
        )
        .get();
      if (already) continue;
    }
    const m = message(kind, l, u);
    try {
      const r = await notify(u, { kind: "reminder", ...m, url: `${appUrl}/lans/${l.id}` });
      if (!r.email && !r.dm) continue;
      db.insert(reminderLog)
        .values({ lanId: l.id, userId: u.id, kind })
        .onConflictDoUpdate({
          target: [reminderLog.lanId, reminderLog.userId, reminderLog.kind],
          set: { sentAt: new Date() },
        })
        .run();
      sent++;
    } catch (e) {
      console.error(`[reminders] ${kind} to ${u.email} failed`, e);
    }
  }
  return sent;
}

/** Which reminder kinds are due for a LAN right now. */
export function dueKinds(l: Lan, now = new Date()): ReminderKind[] {
  const window = l.reminderDays * DAY;
  const t = now.getTime();
  const kinds: ReminderKind[] = [];
  const inWindow = (d: Date | null, w: number) =>
    d && d.getTime() > t && d.getTime() - t <= w;
  if (inWindow(l.signupDeadline, window)) kinds.push("signup");
  if (inWindow(l.paymentDueDate, window)) kinds.push("payment");
  if (inWindow(l.startsAt, DAY)) kinds.push("event");
  return kinds;
}

/**
 * Sends every reminder that is due and hasn't been sent yet. Safe to run as
 * often as you like (each reminder goes out once per user and LAN).
 */
export async function runDueReminders(now = new Date()) {
  // Drafts get no reminders until they're published.
  const lans = db.select().from(lan).where(and(gt(lan.endsAt, now), isNotNull(lan.publishedAt))).all();
  const result: { lan: string; kind: string; sent: number }[] = [];
  for (const l of lans) {
    const kinds = dueKinds(l, now);
    for (const kind of kinds) {
      const sent = await send(kind, l, recipients(kind, l), true);
      if (sent) result.push({ lan: l.name, kind, sent });
    }
    // "Install your games" a couple of days before the LAN, once per person.
    const games = await import("./games");
    if (games.gamesReminderDue(l, now)) {
      const sent = await games.sendGamesReminder(l);
      if (sent) result.push({ lan: l.name, kind: "games", sent });
    }
    // Same reminders as a post in the configured Discord channels, once each.
    const { postDueChannelReminders, refreshLanMessages } = await import("./discord");
    try {
      const posted = await postDueChannelReminders(kinds as ("signup" | "payment" | "event")[], l);
      if (posted) result.push({ lan: l.name, kind: "discord", sent: posted });
      // Also catches deadlines passing, which disables the buttons.
      await refreshLanMessages(l.id);
    } catch (e) {
      console.error("[reminders] discord failed", e);
    }
  }
  return result;
}

/** Admin "nudge now": sends a reminder kind immediately, even if sent before. */
export async function sendReminderNow(l: Lan, kind: "signup" | "payment" | "event") {
  if (kind === "signup" && !l.signupDeadline) return 0;
  if (kind === "payment" && !l.paymentDueDate) return 0;
  return send(kind, l, recipients(kind, l), false);
}
