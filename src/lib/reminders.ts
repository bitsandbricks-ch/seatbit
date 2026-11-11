import { fmtDate } from "./format";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, ReminderKind, User } from "@/db/schema";
import { appUrl, sendMail } from "./mail";

const { lan, user, attendance, reminderLog } = schema;
const DAY = 24 * 60 * 60 * 1000;

const fmt = fmtDate;

function message(kind: ReminderKind, l: Lan, u: User) {
  const link = `${appUrl}/lans/${l.id}`;
  switch (kind) {
    case "signup":
      return {
        subject: `Are you coming to ${l.name}? Decide by ${fmt(l.signupDeadline!)}`,
        text: `Hi ${u.name},\n\nyou haven't confirmed yet whether you're coming to ${l.name} (${fmt(l.startsAt)}, ${l.location || "location tbd"}).\n\nPlease let us know by ${fmt(l.signupDeadline!)}:\n${link}`,
      };
    case "payment":
      return {
        subject: `Buy your ticket for ${l.name} by ${fmt(l.paymentDueDate!)}`,
        text: `Hi ${u.name},\n\nyou're going to ${l.name}, but haven't marked your ticket${l.price ? ` (${l.price})` : ""} as bought yet. Please buy it by ${fmt(l.paymentDueDate!)}${l.ticketUrl ? `:\n${l.ticketUrl}` : "."}\n\nThen tick it off in your checklist: ${link}`,
      };
    case "event":
      return {
        subject: `${l.name} starts soon`,
        text: `Hi ${u.name},\n\n${l.name} starts on ${fmt(l.startsAt)}${l.location ? ` at ${l.location}` : ""}. See you there!\n\nYour seat and details: ${link}`,
      };
    default:
      return { subject: l.name, text: link };
  }
}

/** Who a reminder kind applies to for a LAN. */
function recipients(kind: ReminderKind, l: Lan): User[] {
  const members = db
    .select({ u: user })
    .from(user)
    .innerJoin(schema.clanMember, eq(schema.clanMember.userId, user.id))
    .where(and(eq(user.emailReminders, true), eq(schema.clanMember.clanId, l.clanId ?? "")))
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
      await sendMail(u.email, m.subject, m.text);
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
  const lans = db.select().from(lan).where(gt(lan.endsAt, now)).all();
  const result: { lan: string; kind: string; sent: number }[] = [];
  for (const l of lans) {
    const kinds = dueKinds(l, now);
    for (const kind of kinds) {
      const sent = await send(kind, l, recipients(kind, l), true);
      if (sent) result.push({ lan: l.name, kind, sent });
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
