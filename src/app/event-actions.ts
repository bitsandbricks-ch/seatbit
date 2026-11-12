"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { INTEREST_ANSWERS, type InterestAnswer } from "@/db/schema";
import { getDisplayNames, getLan } from "@/lib/lans";
import { cancelEvent, openSignup, publishEvent, sendNews, uncancelEvent } from "@/lib/event-notices";
import { isClanMember } from "@/lib/clans";
import { canViewLan, isLanManager, requireLanManager, requireUser } from "@/lib/session";
import { auditLan } from "@/lib/audit";
import { fmtDate } from "@/lib/format";

const { lan, lanOrga, lanInterest, lanNews, clanMember, lanType, seat, attendance } = schema;

function mustGetLan(id: string) {
  const l = getLan(id);
  if (!l) throw new Error("Event not found");
  return l;
}

const lanPath = (id: string) => {
  revalidatePath(`/lans/${id}`);
  revalidatePath(`/lans/${id}/manage`);
  revalidatePath("/");
  revalidatePath("/clans", "layout");
};

// ---------------- Publishing ----------------

/** Sets (or clears, with null) the time a draft goes live by itself. */
export async function schedulePublish(lanId: string, at: string | null): Promise<{ error?: string } | void> {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (l.publishedAt) return { error: "The event is already published." };
  const when = at ? new Date(at) : null;
  if (when && isNaN(when.getTime())) return { error: "Pick a valid date and time." };
  if (when && when <= new Date()) {
    await publishEvent(lanId, new Date(), me.id);
  } else {
    db.update(lan).set({ publishAt: when }).where(eq(lan.id, lanId)).run();
    auditLan(l, me.id, "event.schedule", { data: { at: when ? fmtDate(when) : null } });
  }
  lanPath(lanId);
}

// ---------------- Interest check ----------------

/** A member's answer during the interest check: yes / maybe / no. */
export async function setMyInterest(lanId: string, answer: InterestAnswer) {
  const me = await requireUser();
  const l = mustGetLan(lanId);
  if (!canViewLan(me, lanId)) throw new Error("Join the clan first");
  if (!l.interestCheck || l.cancelledAt) throw new Error("The interest check is over.");
  if (!INTEREST_ANSWERS.includes(answer)) throw new Error("Bad answer");
  db.insert(lanInterest)
    .values({ lanId, userId: me.id, answer })
    .onConflictDoUpdate({ target: [lanInterest.lanId, lanInterest.userId], set: { answer } })
    .run();
  void import("@/lib/discord").then((d) => d.refreshLanMessagesSoon(lanId)).catch(() => {});
  lanPath(lanId);
}

/** Ends the interest check: sign-up opens and interested members are told. Needs a fixed date. */
export async function openSignupNow(lanId: string): Promise<{ error?: string; sent?: number }> {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (!l.interestCheck) return {};
  if (l.dateTbd) return { error: "Set the date first (Settings tab), then open sign-up." };
  auditLan(l, me.id, "event.signup_open");
  const sent = await openSignup(l);
  lanPath(lanId);
  return { sent };
}

// ---------------- Cancel ----------------

export async function cancelLan(lanId: string, reason: string): Promise<{ sent: number }> {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (l.cancelledAt) return { sent: 0 };
  auditLan(l, me.id, "event.cancel", { data: { reason: reason.trim().slice(0, 200) || undefined } });
  const sent = await cancelEvent(l, reason.trim().slice(0, 500));
  lanPath(lanId);
  return { sent };
}

export async function uncancelLan(lanId: string) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  if (l.cancelledAt) auditLan(l, me.id, "event.uncancel");
  uncancelEvent(l);
  lanPath(lanId);
}

// ---------------- Next year's edition ----------------

const YEAR = (d: Date | null) => {
  if (!d) return null;
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + 1);
  return x;
};

/**
 * Copies an event as a new draft one year later: details, links, deadlines, seat block (without
 * people) and orgas. The event's own seat plan link is left out, since it changes every year.
 */
export async function copyForNextYear(lanId: string) {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  const bump = (name: string) => {
    const y = l.startsAt.getFullYear();
    return name.includes(String(y)) ? name.replace(String(y), String(y + 1)) : `${name} ${y + 1}`;
  };
  const row = db
    .insert(lan)
    .values({
      clanId: l.clanId,
      typeId: l.typeId,
      name: l.dateTbd ? l.name : bump(l.name),
      description: l.description,
      location: l.location,
      websiteUrl: l.websiteUrl,
      ticketUrl: l.ticketUrl,
      startsAt: YEAR(l.startsAt)!,
      endsAt: YEAR(l.endsAt)!,
      signupDeadline: YEAR(l.signupDeadline),
      paymentDueDate: YEAR(l.paymentDueDate),
      price: l.price,
      capacity: l.capacity,
      reminderDays: l.reminderDays,
      seatRows: l.seatRows,
      seatCols: l.seatCols,
      dateTbd: l.dateTbd,
      dateHint: l.dateHint,
    })
    .returning()
    .get();
  const seats = db.select().from(seat).where(eq(seat.lanId, l.id)).all();
  if (seats.length) {
    db.insert(seat)
      .values(seats.map((s) => ({ lanId: row.id, row: s.row, col: s.col, label: s.label, locked: s.locked })))
      .run();
  }
  const orgas = new Set([me.id, ...db.select().from(lanOrga).where(eq(lanOrga.lanId, l.id)).all().map((o) => o.userId)]);
  // Only orgas who are still in the clan.
  for (const uid of orgas) {
    if (uid === me.id || !l.clanId || isClanMember(uid, l.clanId)) db.insert(lanOrga).values({ lanId: row.id, userId: uid }).run();
  }
  auditLan(row, me.id, "event.copy", { data: { from: l.name } });
  revalidatePath("/");
  redirect(`/lans/${row.id}/manage?tab=settings&copied=1`);
}

// ---------------- Orga news ----------------

export async function postNews(lanId: string, text: string): Promise<{ error?: string; sent?: number }> {
  const me = await requireLanManager(lanId);
  const l = mustGetLan(lanId);
  const t = text.trim();
  if (!t) return { error: "Write something first." };
  if (t.length > 2000) return { error: "Keep it under 2000 characters." };
  db.insert(lanNews).values({ lanId, authorId: me.id, text: t }).run();
  const author = (await getDisplayNames(lanId, [me.id])).get(me.id) ?? me.firstName;
  lanPath(lanId);
  const sent = await sendNews(l, t, author);
  return { sent };
}

export async function deleteNews(newsId: string) {
  const n = db.select().from(lanNews).where(eq(lanNews.id, newsId)).get();
  if (!n) return;
  const me = await requireLanManager(n.lanId);
  db.delete(lanNews).where(eq(lanNews.id, newsId)).run();
  auditLan(mustGetLan(n.lanId), me.id, "news.delete");
  lanPath(n.lanId);
}

// ---------------- Member interests ----------------

/** Which of a clan's events the member hears about: null = all, or a list of LAN type ids. */
export async function setMyInterests(clanId: string, typeIds: string[] | null) {
  const me = await requireUser();
  if (!isClanMember(me.id, clanId)) throw new Error("Not in this clan");
  const valid = new Set(
    db.select({ id: lanType.id }).from(lanType).where(eq(lanType.clanId, clanId)).all().map((t) => t.id),
  );
  const value = typeIds === null ? null : typeIds.filter((t) => valid.has(t));
  db.update(clanMember)
    .set({ interestTypes: value })
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, me.id)))
    .run();
  revalidatePath("/profile");
}

// ---------------- Arrival check-in ----------------

/** "I'm here" on the day. Orgas can tick anyone; members only themselves. */
export async function setArrived(lanId: string, userId: string | null, arrived: boolean) {
  const me = await requireUser();
  const target = userId ?? me.id;
  if (target !== me.id && !isLanManager(me, lanId)) throw new Error("Only orgas can check in others");
  const a = db.select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, target))).get();
  if (!a || a.status !== "going") throw new Error("Only people coming can check in.");
  db.update(attendance)
    .set({ arrivedAt: arrived ? new Date() : null })
    .where(eq(attendance.id, a.id))
    .run();
  if (target !== me.id && !!a.arrivedAt !== arrived) auditLan(mustGetLan(lanId), me.id, "arrived.set", { targetUserId: target, data: { arrived } });
  lanPath(lanId);
}
