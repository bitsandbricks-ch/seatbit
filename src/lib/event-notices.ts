/**
 * The event lifecycle beyond the day-to-day: publishing a draft (now or at a set time), the optional
 * interest check, opening sign-up, cancelling, and lead news. Each step tells the right people once.
 */
import { and, eq, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, ReminderKind, User } from "@/db/schema";
import { fmtDate } from "./format";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { eventMailVars, renderTemplate } from "./mail-templates";
import { localeOf } from "../i18n/user-locale";
import type { Locale } from "../i18n/config";
import { auditLan } from "./audit";

const { lan, user, clanMember, attendance, lanInterest, reminderLog } = schema;

/** Whether a member wants to hear about an event: all events, or the event's LAN type is one they picked. */
export function wantsEvent(interestTypes: string[] | null | undefined, l: Pick<Lan, "typeId">) {
  return !interestTypes || !l.typeId || interestTypes.includes(l.typeId);
}

/** Clan members (not pending) who want to hear about this event. */
export function interestedMembers(l: Lan): User[] {
  if (!l.clanId) return [];
  return db
    .select({ u: user, interestTypes: clanMember.interestTypes })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(and(eq(clanMember.clanId, l.clanId), ne(clanMember.role, "pending")))
    .all()
    .filter((r) => wantsEvent(r.interestTypes, l))
    .map((r) => r.u);
}

/** Everyone who answered for the event: coming, unsure or waitlist, plus "yes"/"maybe" in the interest check. */
export function involvedMembers(l: Lan): User[] {
  const fromAttendance = db
    .select({ u: user })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.lanId, l.id), inArray(attendance.status, ["going", "maybe", "waitlist"])))
    .all();
  const fromInterest = db
    .select({ u: user })
    .from(lanInterest)
    .innerJoin(user, eq(user.id, lanInterest.userId))
    .where(and(eq(lanInterest.lanId, l.id), inArray(lanInterest.answer, ["yes", "maybe"])))
    .all();
  const byId = new Map([...fromAttendance, ...fromInterest].map((r) => [r.u.id, r.u]));
  return [...byId.values()];
}

/** Sends one notice per user, at most once per (event, user, kind) when `dedupe` is set. Returns how many got it. */
async function sendEach(
  l: Lan,
  users: User[],
  kind: ReminderKind | null,
  build: (u: User) => { subject: string; text: string; html?: string; dm?: string },
  opts: { reminder?: boolean } = {},
) {
  let sent = 0;
  for (const u of users) {
    if (kind) {
      const done = db
        .select()
        .from(reminderLog)
        .where(and(eq(reminderLog.lanId, l.id), eq(reminderLog.userId, u.id), eq(reminderLog.kind, kind)))
        .get();
      if (done) continue;
    }
    try {
      const r = await notify(u, {
        // "reminder" respects the member's email opt-out; cancellations always go out.
        kind: opts.reminder ? "reminder" : (kind ?? "lan_news"),
        ...build(u),
        url: `${appUrl}/lans/${l.id}`,
      });
      if (!r.email && !r.dm) continue;
      sent++;
      if (kind) db.insert(reminderLog).values({ lanId: l.id, userId: u.id, kind }).onConflictDoNothing().run();
    } catch (e) {
      console.error("[event-notices] %s failed", kind ?? "news", e);
    }
  }
  return sent;
}

const deadlineVar = (l: Lan, loc: Locale) => (l.signupDeadline ? fmtDate(l.signupDeadline, loc) : "");

/** Renders an event mail in the member's language, with the placeholders every event mail has. */
const eventMail = (
  id: Parameters<typeof renderTemplate>[0],
  l: Lan,
  u: User,
  extra: (loc: Locale) => Record<string, string | null | undefined> = () => ({}),
) => {
  const loc = localeOf(u);
  return renderTemplate(id, { ...eventMailVars(l, u, loc), ...extra(loc) }, loc);
};

/**
 * Makes a draft live: members see it, the Discord channels get the post and interested members a
 * "new event" (or "would you come?") mail/DM. Safe to call twice.
 */
/** `by` = who published it; null = the scheduled publish. */
export async function publishEvent(lanId: string, now = new Date(), by: string | null = null) {
  const before = db.select().from(lan).where(eq(lan.id, lanId)).get();
  if (!before || before.publishedAt) return false;
  db.update(lan).set({ publishedAt: now, publishAt: null }).where(eq(lan.id, lanId)).run();
  const l = { ...before, publishedAt: now, publishAt: null };
  auditLan(l, by, "event.publish", { data: { scheduled: by === null } });
  const { announceLan } = await import("./discord");
  await announceLan(lanId).catch((e) => console.error("[discord] announce failed", e));
  if (!l.cancelledAt && l.endsAt > now) {
    void sendEach(
      l,
      interestedMembers(l),
      "published",
      (u) =>
        l.interestCheck
          ? eventMail("interestCheck", l, u)
          : eventMail("eventPublished", l, u, (loc) => ({ deadline: deadlineVar(l, loc) })),
      { reminder: true },
    ).catch((e) => console.error("[event-notices] publish notices failed", e));
  }
  return true;
}

/** Publishes every draft whose scheduled time has come (run by the reminder loop). */
export async function publishDueDrafts(now = new Date()) {
  const due = db
    .select({ id: lan.id, name: lan.name })
    .from(lan)
    .where(and(isNull(lan.publishedAt), isNotNull(lan.publishAt), lte(lan.publishAt, now)))
    .all();
  for (const d of due) if (await publishEvent(d.id, now)) console.log(`[publish] ${d.name} went live as scheduled`);
  return due.length;
}

/** Ends the interest check: sign-up opens and everyone interested (except those who said no) is told. */
export async function openSignup(l: Lan) {
  db.update(lan).set({ interestCheck: false }).where(eq(lan.id, l.id)).run();
  const after = { ...l, interestCheck: false };
  const saidNo = new Set(
    db
      .select({ userId: lanInterest.userId })
      .from(lanInterest)
      .where(and(eq(lanInterest.lanId, l.id), eq(lanInterest.answer, "no")))
      .all()
      .map((r) => r.userId),
  );
  const { refreshLanMessages } = await import("./discord");
  await refreshLanMessages(l.id).catch(() => {});
  if (!l.publishedAt) return 0;
  return sendEach(
    after,
    interestedMembers(after).filter((u) => !saidNo.has(u.id)),
    "signup_open",
    (u) => eventMail("signupOpen", after, u, (loc) => ({ deadline: deadlineVar(after, loc) })),
    { reminder: true },
  );
}

/** Cancels an event and tells everyone who had answered (always by mail too: it matters). */
export async function cancelEvent(l: Lan, reason: string) {
  const now = new Date();
  db.update(lan).set({ cancelledAt: now, cancelReason: reason }).where(eq(lan.id, l.id)).run();
  const after = { ...l, cancelledAt: now, cancelReason: reason };
  const { refreshLanMessages } = await import("./discord");
  await refreshLanMessages(l.id).catch(() => {});
  if (!l.publishedAt) return 0;
  return sendEach(after, involvedMembers(after), "cancelled", (u) =>
    eventMail("eventCancelled", after, u, () => ({ reason })),
  );
}

/** Takes back a cancellation (no notices: leads tell people themselves, e.g. with news). */
export function uncancelEvent(l: Lan) {
  db.update(lan).set({ cancelledAt: null, cancelReason: "" }).where(eq(lan.id, l.id)).run();
  db.delete(reminderLog).where(and(eq(reminderLog.lanId, l.id), eq(reminderLog.kind, "cancelled"))).run();
  void import("./discord").then((d) => d.refreshLanMessagesSoon(l.id)).catch(() => {});
}

/** Sends lead news to everyone involved. Returns how many got it. */
export async function sendNews(l: Lan, text: string, author: string) {
  if (!l.publishedAt) return 0;
  const { postLanNews } = await import("./discord");
  await postLanNews(l, text, author).catch((e) => console.error("[discord] news failed", e));
  return sendEach(l, involvedMembers(l), null, (u) => eventMail("eventNews", l, u, () => ({ news: text, author })), {
    reminder: true,
  });
}
