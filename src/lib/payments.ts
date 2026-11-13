import "server-only";
import { and, asc, desc, eq, gt, inArray, lte, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Charge, ChargeItem, ChargeItemStatus, Clan } from "@/db/schema";
import { fmtDay } from "./format";
import { fmtAmount } from "./money";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { getBoolSetting } from "./settings";

/**
 * Clan payments: money a clan collects from its own members (yearly dues, ticket money, a shared
 * cost). A lead creates a charge, every person on it gets a line with what they owe, and leads tick
 * lines off when the money arrives (cash, bank, TWINT). Seatbit only keeps the list; no money goes
 * through it. Members can say "I've paid", which a lead then confirms.
 */

const { charge, chargeItem, clan } = schema;
const DAY = 86400_000;
/** Members hear about a due date this many days before it. */
export const PAYMENT_REMINDER_DAYS = 3;

/** The operator allows clan payments on this instance (on unless turned off). */
export const paymentsAvailable = () => getBoolSetting("payments.enabled");

/** Payments are on for this clan. */
export const clanPaymentsOn = (c: Pick<Clan, "paymentsEnabled">) => paymentsAvailable() && c.paymentsEnabled;

/** Lines that still count as owed. A reported line is owed until a lead confirms it. */
export const OWED: ChargeItemStatus[] = ["open", "reported"];
export const isOwed = (s: ChargeItemStatus) => OWED.includes(s);

export type ChargeSummary = Charge & {
  people: number;
  paid: number;
  owed: number;
  reported: number;
  totalCents: number;
  collectedCents: number;
  lanName: string | null;
};

function summarize(c: Charge, items: ChargeItem[], lanName: string | null): ChargeSummary {
  const counted = items.filter((i) => i.status !== "waived");
  return {
    ...c,
    people: items.length,
    paid: items.filter((i) => i.status === "paid").length,
    owed: items.filter((i) => isOwed(i.status)).length,
    reported: items.filter((i) => i.status === "reported").length,
    totalCents: counted.reduce((n, i) => n + i.amountCents, 0),
    collectedCents: items.filter((i) => i.status === "paid").reduce((n, i) => n + i.amountCents, 0),
    lanName,
  };
}

function lanNames(ids: (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  return new Map(
    list.length ? db.select({ id: schema.lan.id, name: schema.lan.name }).from(schema.lan).where(inArray(schema.lan.id, list)).all().map((l) => [l.id, l.name]) : [],
  );
}

/** The clan's charges, newest first, with how many have paid. */
export function clanCharges(clanId: string): ChargeSummary[] {
  const rows = db.select().from(charge).where(eq(charge.clanId, clanId)).orderBy(desc(charge.createdAt)).all();
  if (!rows.length) return [];
  const items = db.select().from(chargeItem).where(inArray(chargeItem.chargeId, rows.map((r) => r.id))).all();
  const names = lanNames(rows.map((r) => r.lanId));
  return rows.map((r) =>
    summarize(
      r,
      items.filter((i) => i.chargeId === r.id),
      r.lanId ? (names.get(r.lanId) ?? null) : null,
    ),
  );
}

export function getCharge(id: string) {
  return db.select().from(charge).where(eq(charge.id, id)).get();
}

/** A charge with its lines (open ones first, then by when they were added). */
export function chargeDetail(id: string) {
  const c = getCharge(id);
  if (!c) return null;
  const order: Record<ChargeItemStatus, number> = { reported: 0, open: 1, paid: 2, waived: 3 };
  const items = db
    .select()
    .from(chargeItem)
    .where(eq(chargeItem.chargeId, id))
    .orderBy(asc(chargeItem.createdAt))
    .all()
    .sort((a, b) => order[a.status] - order[b.status]);
  const lanName = c.lanId ? (lanNames([c.lanId]).get(c.lanId) ?? null) : null;
  return { charge: summarize(c, items, lanName), items };
}

export type MyLine = ChargeItem & { charge: Charge; lanName: string | null };

/** A member's lines in a clan (or at one event), owed ones first, then newest. */
export function memberLines(userId: string, opts: { clanId?: string; lanId?: string }): MyLine[] {
  const where = [eq(chargeItem.userId, userId)];
  if (opts.clanId) where.push(eq(charge.clanId, opts.clanId));
  if (opts.lanId) where.push(eq(charge.lanId, opts.lanId));
  const rows = db
    .select({ i: chargeItem, c: charge })
    .from(chargeItem)
    .innerJoin(charge, eq(charge.id, chargeItem.chargeId))
    .where(and(...where))
    .orderBy(desc(charge.createdAt))
    .all();
  const names = lanNames(rows.map((r) => r.c.lanId));
  return rows
    .map(({ i, c }) => ({ ...i, charge: c, lanName: c.lanId ? (names.get(c.lanId) ?? null) : null }))
    .sort((a, b) => Number(isOwed(b.status)) - Number(isOwed(a.status)));
}

/** What a member still owes the clan: how many lines and the sum per currency ("CHF 45.00"). */
export function owedSummary(lines: MyLine[]) {
  const owed = lines.filter((l) => l.status === "open");
  const sums = new Map<string, number>();
  for (const l of owed) sums.set(l.charge.currency, (sums.get(l.charge.currency) ?? 0) + l.amountCents);
  return { count: owed.length, text: [...sums].map(([cur, cents]) => fmtAmount(cents, cur)).join(" + ") };
}

/** Lines members reported as paid that a lead still has to check, for the Manage tab badge. */
export function reportedCount(clanId: string) {
  return db
    .select({ id: chargeItem.id })
    .from(chargeItem)
    .innerJoin(charge, eq(charge.id, chargeItem.chargeId))
    .where(and(eq(charge.clanId, clanId), eq(chargeItem.status, "reported")))
    .all().length;
}

/** People who can be put on a charge: everyone in the clan, guests included. */
export function chargeablePeople(clanId: string) {
  return db
    .select({ id: schema.user.id })
    .from(schema.clanMember)
    .innerJoin(schema.user, eq(schema.user.id, schema.clanMember.userId))
    .where(and(eq(schema.clanMember.clanId, clanId), ne(schema.clanMember.role, "pending")))
    .all()
    .map((r) => r.id);
}

/** Everyone coming to an event (not the waitlist): who ticket money and shared costs are for. */
export function goingTo(lanId: string) {
  return db
    .select({ id: schema.attendance.userId })
    .from(schema.attendance)
    .where(and(eq(schema.attendance.lanId, lanId), eq(schema.attendance.status, "going")))
    .all()
    .map((r) => r.id);
}

// ---------- Notifications ----------

const linesUrl = (c: Pick<Clan, "slug">) => `${appUrl}/clans/${c.slug}?tab=payments`;

/** "New charge" to the people on it. */
export async function notifyNewCharge(c: Clan, ch: Charge, items: Pick<ChargeItem, "userId" | "amountCents">[]) {
  for (const it of items) {
    await notify(it.userId, (t) => ({
      kind: "payment_charge",
      subject: t("payments.notice.newSubject", { title: ch.title, clan: c.name }),
      text: [
        t("payments.notice.newText", { clan: c.name, title: ch.title, amount: fmtAmount(it.amountCents, ch.currency) }),
        ch.dueAt ? t("payments.notice.due", { date: fmtDay(ch.dueAt) }) : "",
        c.paymentInfo ? `${t("payments.notice.how")}\n${c.paymentInfo}` : "",
        linesUrl(c),
      ]
        .filter(Boolean)
        .join("\n\n"),
      url: linesUrl(c),
    })).catch((e) => console.error("[payments] notice to %s failed", it.userId, e));
  }
}

/** Reminds the people on these lines (open ones only; a reported line waits for a lead, not the member). */
export async function sendPaymentReminders(lines: (ChargeItem & { charge: Charge; clan: Clan })[]) {
  let sent = 0;
  for (const l of lines) {
    if (l.status !== "open") continue;
    try {
      const r = await notify(l.userId, (t) => ({
        kind: "reminder",
        subject: t("payments.notice.remindSubject", { title: l.charge.title, clan: l.clan.name }),
        text: [
          t("payments.notice.remindText", { clan: l.clan.name, title: l.charge.title, amount: fmtAmount(l.amountCents, l.charge.currency) }),
          l.charge.dueAt ? t("payments.notice.due", { date: fmtDay(l.charge.dueAt) }) : "",
          l.clan.paymentInfo ? `${t("payments.notice.how")}\n${l.clan.paymentInfo}` : "",
          t("payments.notice.alreadyPaid"),
          linesUrl(l.clan),
        ]
          .filter(Boolean)
          .join("\n\n"),
        url: linesUrl(l.clan),
      }));
      db.update(chargeItem).set({ remindedAt: new Date() }).where(eq(chargeItem.id, l.id)).run();
      if (r.email || r.dm) sent++;
    } catch (e) {
      console.error("[payments] reminder for %s failed", l.id, e);
    }
  }
  return sent;
}

/** Open lines of one charge, with what a reminder needs. */
export function openLinesOf(chargeId: string) {
  return db
    .select({ i: chargeItem, c: charge, clan })
    .from(chargeItem)
    .innerJoin(charge, eq(charge.id, chargeItem.chargeId))
    .innerJoin(clan, eq(clan.id, charge.clanId))
    .where(and(eq(chargeItem.chargeId, chargeId), eq(chargeItem.status, "open")))
    .all()
    .map(({ i, c, clan }) => ({ ...i, charge: c, clan }));
}

/**
 * The automatic reminder: once per line, a few days before the due date, for clans that have
 * payments on. A line a lead reminded by hand inside that window isn't reminded again.
 */
export async function runPaymentReminders(now = new Date()) {
  if (!paymentsAvailable()) return 0;
  const rows = db
    .select({ i: chargeItem, c: charge, clan })
    .from(chargeItem)
    .innerJoin(charge, eq(charge.id, chargeItem.chargeId))
    .innerJoin(clan, eq(clan.id, charge.clanId))
    .where(
      and(
        eq(chargeItem.status, "open"),
        eq(clan.paymentsEnabled, true),
        gt(charge.dueAt, now),
        lte(charge.dueAt, new Date(now.getTime() + PAYMENT_REMINDER_DAYS * DAY)),
      ),
    )
    .all();
  // Reminded before this charge's window opened (e.g. when it was created) doesn't count.
  const due = rows.filter(({ i, c }) => !i.remindedAt || i.remindedAt.getTime() < c.dueAt!.getTime() - PAYMENT_REMINDER_DAYS * DAY);
  return sendPaymentReminders(due.map(({ i, c, clan }) => ({ ...i, charge: c, clan })));
}
