"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { CHARGE_KINDS, PAID_VIA, type ChargeItemStatus, type PaidVia } from "@/db/schema";
import { err, tr } from "@/i18n/server";
import { audit } from "@/lib/audit";
import { getClan } from "@/lib/clans";
import { fmtAmount, parseAmount, splitCents } from "@/lib/money";
import { notifyLater } from "@/lib/notify";
import {
  chargeablePeople,
  getCharge,
  goingTo,
  notifyNewCharge,
  openLinesOf,
  paymentsAvailable,
  sendPaymentReminders,
} from "@/lib/payments";
import { foodCurrency } from "@/lib/food";
import { requireClanPermission, requireUser } from "@/lib/session";
import type { FormState } from "./actions";

const { charge, chargeItem, clan } = schema;
const MAX_PEOPLE = 300;

const refresh = (slug: string) => {
  revalidatePath(`/clans/${slug}`, "layout");
};

async function mustClan(clanId: string) {
  const c = getClan(clanId);
  if (!c) throw await err("errors.clanGone");
  return c;
}

async function mustCharge(chargeId: string) {
  const ch = getCharge(chargeId);
  if (!ch) throw await err("errors.chargeGone");
  const me = await requireClanPermission(ch.clanId, "payments");
  return { ch, me, c: await mustClan(ch.clanId) };
}

async function mustItem(itemId: string) {
  const it = db.select().from(chargeItem).where(eq(chargeItem.id, itemId)).get();
  if (!it) throw await err("errors.chargeGone");
  return { it, ...(await mustCharge(it.chargeId)) };
}

// ---------- Clan switch ----------

export async function savePaymentSettings(clanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "payments");
  const c = await mustClan(clanId);
  if (!paymentsAvailable()) return { error: await tr("errors.paymentsOff") };
  const enabled = formData.get("enabled") === "on";
  const paymentInfo = String(formData.get("paymentInfo") ?? "").trim().slice(0, 1000);
  db.update(clan).set({ paymentsEnabled: enabled, paymentInfo }).where(eq(clan.id, clanId)).run();
  if (enabled !== c.paymentsEnabled || paymentInfo !== c.paymentInfo)
    audit({ actorId: me.id, action: "payment.settings", clanId, data: { on: enabled, info: paymentInfo !== c.paymentInfo || undefined } });
  refresh(c.slug);
  return { ok: true, message: await tr("payments.saved") };
}

// ---------- Charges ----------

const chargeInput = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(CHARGE_KINDS),
  note: z.string().trim().max(1000),
  currency: z.string().trim().regex(/^\S{1,5}$/),
  dueAt: z
    .string()
    .transform((v) => (v ? new Date(v) : null))
    .refine((d) => d === null || !isNaN(d.getTime())),
});

/** Creates a charge and a line for everyone on it, then sends the leads to its page. */
export async function createCharge(clanId: string, _: FormState, formData: FormData): Promise<FormState> {
  const me = await requireClanPermission(clanId, "payments");
  const c = await mustClan(clanId);
  if (!paymentsAvailable() || !c.paymentsEnabled) return { error: await tr("errors.paymentsOff") };
  const parsed = chargeInput.safeParse({
    title: formData.get("title"),
    kind: formData.get("kind") ?? "other",
    note: formData.get("note") ?? "",
    currency: formData.get("currency") || foodCurrency(),
    dueAt: formData.get("dueAt") ?? "",
  });
  if (!parsed.success) return { error: await tr("payments.form.invalid") };

  const lanId = String(formData.get("lanId") ?? "") || null;
  if (lanId) {
    const l = db.select({ clanId: schema.lan.clanId }).from(schema.lan).where(eq(schema.lan.id, lanId)).get();
    if (l?.clanId !== clanId) return { error: await tr("payments.form.invalid") };
  }
  const inClan = new Set(chargeablePeople(clanId));
  const who = String(formData.get("who") ?? "members");
  let people: string[];
  if (who === "going") {
    if (!lanId) return { error: await tr("payments.form.pickEvent") };
    people = goingTo(lanId).filter((id) => inClan.has(id));
  } else if (who === "pick") {
    people = formData.getAll("people").map(String).filter((id) => inClan.has(id));
  } else people = [...inClan];
  people = [...new Set(people)].slice(0, MAX_PEOPLE);
  if (!people.length) return { error: await tr("payments.form.nobody") };

  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { error: await tr("payments.form.amountError") };
  const split = formData.get("split") === "total";
  const amounts = split ? splitCents(amount, people.length) : people.map(() => amount);

  const row = db.transaction((tx) => {
    const ch = tx
      .insert(charge)
      .values({ ...parsed.data, clanId, lanId: parsed.data.kind === "dues" ? null : lanId, createdBy: me.id })
      .returning()
      .get();
    tx.insert(chargeItem)
      .values(people.map((userId, i) => ({ chargeId: ch.id, userId, amountCents: amounts[i] })))
      .run();
    return ch;
  });
  audit({
    actorId: me.id,
    action: "payment.charge_create",
    clanId,
    lanId: row.lanId,
    data: { title: row.title, people: people.length, amount: fmtAmount(split ? amount : amount * people.length, row.currency) },
  });
  if (formData.get("notify") === "on") {
    // Guests have no address and no Discord, so notify() skips them.
    notifyLater(() => notifyNewCharge(c, row, people.map((userId, i) => ({ userId, amountCents: amounts[i] }))));
  }
  refresh(c.slug);
  redirect(`/clans/${c.slug}/payments/${row.id}`);
}

export async function updateCharge(chargeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { ch, me, c } = await mustCharge(chargeId);
  const parsed = chargeInput.safeParse({
    title: formData.get("title"),
    kind: ch.kind,
    note: formData.get("note") ?? "",
    currency: ch.currency,
    dueAt: formData.get("dueAt") ?? "",
  });
  if (!parsed.success) return { error: await tr("payments.form.invalid") };
  const { title, note, dueAt } = parsed.data;
  db.update(charge).set({ title, note, dueAt }).where(eq(charge.id, chargeId)).run();
  audit({ actorId: me.id, action: "payment.charge_update", clanId: ch.clanId, lanId: ch.lanId, data: { title } });
  refresh(c.slug);
  return { ok: true, message: await tr("payments.saved") };
}

export async function deleteCharge(chargeId: string) {
  const { ch, me, c } = await mustCharge(chargeId);
  db.delete(charge).where(eq(charge.id, chargeId)).run();
  audit({ actorId: me.id, action: "payment.charge_delete", clanId: ch.clanId, lanId: ch.lanId, data: { title: ch.title } });
  refresh(c.slug);
  redirect(`/clans/${c.slug}/settings?tab=payments`);
}

/** Adds people to a charge with the same amount each. */
export async function addToCharge(chargeId: string, _: FormState, formData: FormData): Promise<FormState> {
  const { ch, me, c } = await mustCharge(chargeId);
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (amount === null || Number.isNaN(amount) || amount <= 0) return { error: await tr("payments.form.amountError") };
  const inClan = new Set(chargeablePeople(ch.clanId));
  const already = new Set(
    db.select({ u: chargeItem.userId }).from(chargeItem).where(eq(chargeItem.chargeId, chargeId)).all().map((r) => r.u),
  );
  const people = [...new Set(formData.getAll("people").map(String))].filter((id) => inClan.has(id) && !already.has(id));
  if (!people.length) return { error: await tr("payments.form.nobody") };
  db.insert(chargeItem)
    .values(people.map((userId) => ({ chargeId, userId, amountCents: amount })))
    .run();
  audit({ actorId: me.id, action: "payment.add", clanId: ch.clanId, lanId: ch.lanId, data: { title: ch.title, people: people.length } });
  if (formData.get("notify") === "on") notifyLater(() => notifyNewCharge(c, ch, people.map((userId) => ({ userId, amountCents: amount }))));
  refresh(c.slug);
  return { ok: true };
}

/** Sends the open lines of a charge a reminder now. */
export async function remindCharge(chargeId: string) {
  const { ch, me, c } = await mustCharge(chargeId);
  const lines = openLinesOf(chargeId);
  // Stamped now, so the page shows it at once; the mails and DMs go out after the response.
  db.update(chargeItem)
    .set({ remindedAt: new Date() })
    .where(and(eq(chargeItem.chargeId, chargeId), eq(chargeItem.status, "open")))
    .run();
  notifyLater(() => sendPaymentReminders(lines));
  audit({ actorId: me.id, action: "payment.remind", clanId: ch.clanId, lanId: ch.lanId, data: { title: ch.title, people: lines.length } });
  refresh(c.slug);
}

// ---------- Lines ----------

/** A lead sets a line: paid (and how), waived, or back to open. */
export async function setLineStatus(itemId: string, status: Exclude<ChargeItemStatus, "reported">, via?: PaidVia) {
  const { it, ch, me, c } = await mustItem(itemId);
  if (!["open", "paid", "waived"].includes(status)) throw await err("payments.form.invalid");
  const paidVia = status === "paid" ? (via && PAID_VIA.includes(via) ? via : "other") : null;
  db.update(chargeItem)
    .set({ status, paidVia, paidAt: status === "paid" ? new Date() : null, markedBy: status === "open" ? null : me.id })
    .where(eq(chargeItem.id, itemId))
    .run();
  audit({
    actorId: me.id,
    action: "payment.mark",
    clanId: ch.clanId,
    lanId: ch.lanId,
    targetUserId: it.userId,
    data: { title: ch.title, status, via: paidVia ?? undefined, from: it.status },
  });
  refresh(c.slug);
}

/** Marks several lines paid at once (the "everyone paid in cash at the LAN" case). */
export async function markLinesPaid(chargeId: string, formData: FormData) {
  const { ch, me, c } = await mustCharge(chargeId);
  const ids = formData.getAll("line").map(String);
  const via = String(formData.get("via") ?? "cash") as PaidVia;
  if (!ids.length) return;
  const lines = db
    .select()
    .from(chargeItem)
    .where(and(eq(chargeItem.chargeId, chargeId), inArray(chargeItem.id, ids)))
    .all()
    .filter((l) => l.status === "open" || l.status === "reported");
  const now = new Date();
  for (const l of lines) {
    db.update(chargeItem)
      .set({ status: "paid", paidVia: PAID_VIA.includes(via) ? via : "other", paidAt: now, markedBy: me.id })
      .where(eq(chargeItem.id, l.id))
      .run();
    audit({ actorId: me.id, action: "payment.mark", clanId: ch.clanId, lanId: ch.lanId, targetUserId: l.userId, data: { title: ch.title, status: "paid", via, from: l.status } });
  }
  refresh(c.slug);
}

export async function setLineAmount(itemId: string, formData: FormData) {
  const { it, ch, me, c } = await mustItem(itemId);
  const amount = parseAmount(String(formData.get("amount") ?? ""));
  if (amount === null || Number.isNaN(amount) || amount <= 0) throw await err("payments.form.amountError");
  if (amount === it.amountCents) return;
  db.update(chargeItem).set({ amountCents: amount }).where(eq(chargeItem.id, itemId)).run();
  audit({
    actorId: me.id,
    action: "payment.amount",
    clanId: ch.clanId,
    lanId: ch.lanId,
    targetUserId: it.userId,
    data: { title: ch.title, amount: fmtAmount(amount, ch.currency) },
  });
  refresh(c.slug);
}

export async function removeLine(itemId: string) {
  const { it, ch, me, c } = await mustItem(itemId);
  db.delete(chargeItem).where(eq(chargeItem.id, itemId)).run();
  audit({ actorId: me.id, action: "payment.remove", clanId: ch.clanId, lanId: ch.lanId, targetUserId: it.userId, data: { title: ch.title } });
  refresh(c.slug);
}

// ---------- Members ----------

/** "I've paid": the member's own line goes to reported until a lead checks it. Again = take it back. */
export async function reportPaid(itemId: string, reported: boolean) {
  const me = await requireUser();
  const it = db.select().from(chargeItem).where(eq(chargeItem.id, itemId)).get();
  if (!it || it.userId !== me.id) throw await err("errors.chargeGone");
  const ch = getCharge(it.chargeId)!;
  const c = await mustClan(ch.clanId);
  const from: ChargeItemStatus = reported ? "open" : "reported";
  if (it.status !== from) return;
  db.update(chargeItem)
    .set({ status: reported ? "reported" : "open" })
    .where(eq(chargeItem.id, itemId))
    .run();
  if (reported) audit({ actorId: me.id, action: "payment.report", clanId: ch.clanId, lanId: ch.lanId, targetUserId: me.id, data: { title: ch.title } });
  refresh(c.slug);
  if (ch.lanId) revalidatePath(`/lans/${ch.lanId}`);
}
