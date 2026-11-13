"use server";
import { err, tr } from "@/i18n/server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { costPeople, MAX_EXPENSES } from "@/lib/costs";
import { getLan } from "@/lib/lans";
import { parseAmount, splitCents } from "@/lib/money";
import { canTakePart, isLanManager, requireUser } from "@/lib/session";

const { costExpense, costShare, costSettlement, attendance } = schema;

const costsPath = (lanId: string) => revalidatePath(`/lans/${lanId}`);

/** Everyone with an answer other than "not coming" can log costs; leads always. */
function canAdd(me: User, lanId: string) {
  if (isLanManager(me, lanId)) return true;
  if (!canTakePart(me, lanId)) return false;
  const a = db
    .select({ status: attendance.status })
    .from(attendance)
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, me.id)))
    .get();
  return !!a && a.status !== "declined";
}

/** Who logged it, who paid it, or a lead may change an expense. */
function canEdit(me: User, e: { lanId: string; paidBy: string; createdBy: string | null }) {
  return e.createdBy === me.id || e.paidBy === me.id || isLanManager(me, e.lanId);
}

const expenseInput = z.object({
  title: z.string().trim().min(1).max(80),
  note: z.string().trim().max(300),
  amount: z
    .string()
    .transform(parseAmount)
    .refine((c): c is number => c !== null && Number.isFinite(c) && c > 0),
  paidBy: z.string().min(1),
  people: z.array(z.string().min(1)).min(1).max(200),
});

async function parseExpense(lanId: string, me: User, formData: FormData): Promise<{ error?: string; data?: z.infer<typeof expenseInput> }> {
  const parsed = expenseInput.safeParse({
    title: formData.get("title") ?? "",
    note: formData.get("note") ?? "",
    amount: String(formData.get("amount") ?? ""),
    paidBy: String(formData.get("paidBy") ?? ""),
    people: [...new Set(formData.getAll("people").map(String))],
  });
  if (!parsed.success) {
    const bad = new Set(parsed.error.issues.map((i) => i.path[0]));
    if (bad.has("amount")) return { error: await tr("costs.errors.amount") };
    if (bad.has("people")) return { error: await tr("costs.errors.people") };
    return { error: await tr("costs.errors.title") };
  }
  // Only people at the event (and me as a lead) can pay or share, so nobody gets billed from outside.
  const allowed = costPeople(lanId);
  if (isLanManager(me, lanId)) allowed.add(me.id);
  const { paidBy, people } = parsed.data;
  if (!allowed.has(paidBy) || people.some((p) => !allowed.has(p))) return { error: await tr("costs.errors.notHere") };
  return { data: parsed.data };
}

/** Even split; the odd cents go to the first people, so the shares add up to the amount. */
function shareRows(expenseId: string, amountCents: number, people: string[]) {
  const parts = splitCents(amountCents, people.length);
  return people.map((userId, i) => ({ expenseId, userId, amountCents: parts[i] }));
}

/** Logs something one person paid for the group, split evenly between the people ticked. */
export async function addExpense(lanId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!getLan(lanId)) return { error: await tr("errors.eventGone") };
  if (!canAdd(me, lanId)) return { error: await tr("costs.errors.add") };
  const r = await parseExpense(lanId, me, formData);
  if (!r.data) return { error: r.error };
  if (db.select({ id: costExpense.id }).from(costExpense).where(eq(costExpense.lanId, lanId)).all().length >= MAX_EXPENSES)
    return { error: await tr("costs.errors.max", { count: MAX_EXPENSES }) };
  const { title, note, amount, paidBy, people } = r.data;
  db.transaction((tx) => {
    const e = tx.insert(costExpense).values({ lanId, title, note, amountCents: amount, paidBy, createdBy: me.id }).returning().get();
    tx.insert(costShare).values(shareRows(e.id, amount, people)).run();
  });
  costsPath(lanId);
  return {};
}

export async function updateExpense(expenseId: string, formData: FormData): Promise<{ error?: string }> {
  const me = await requireUser();
  const e = db.select().from(costExpense).where(eq(costExpense.id, expenseId)).get();
  if (!e) return { error: await tr("costs.errors.gone") };
  if (!canEdit(me, e)) return { error: await tr("costs.errors.edit") };
  const r = await parseExpense(e.lanId, me, formData);
  if (!r.data) return { error: r.error };
  const { title, note, amount, paidBy, people } = r.data;
  db.transaction((tx) => {
    tx.update(costExpense).set({ title, note, amountCents: amount, paidBy }).where(eq(costExpense.id, e.id)).run();
    tx.delete(costShare).where(eq(costShare.expenseId, e.id)).run();
    tx.insert(costShare).values(shareRows(e.id, amount, people)).run();
  });
  costsPath(e.lanId);
  return {};
}

export async function deleteExpense(expenseId: string) {
  const me = await requireUser();
  const e = db.select().from(costExpense).where(eq(costExpense.id, expenseId)).get();
  if (!e) return;
  if (!canEdit(me, e)) throw await err("costs.errors.edit");
  db.delete(costExpense).where(eq(costExpense.id, e.id)).run();
  costsPath(e.lanId);
}

/**
 * Ticks off money paid back. Either of the two can, like tickets it's trust-based; a lead can
 * too, for people who don't use Seatbit much.
 */
export async function recordSettlement(lanId: string, fromUserId: string, toUserId: string, amount: string): Promise<{ error?: string }> {
  const me = await requireUser();
  if (!getLan(lanId) || !canTakePart(me, lanId)) return { error: await tr("errors.eventGone") };
  if (me.id !== fromUserId && me.id !== toUserId && !isLanManager(me, lanId)) return { error: await tr("costs.errors.settle") };
  const cents = parseAmount(amount);
  if (cents === null || !Number.isFinite(cents) || cents <= 0) return { error: await tr("costs.errors.amount") };
  if (fromUserId === toUserId) return { error: await tr("costs.errors.self") };
  const allowed = costPeople(lanId);
  if (isLanManager(me, lanId)) allowed.add(me.id);
  if (!allowed.has(fromUserId) || !allowed.has(toUserId)) return { error: await tr("costs.errors.notHere") };
  db.insert(costSettlement).values({ lanId, fromUserId, toUserId, amountCents: cents, createdBy: me.id }).run();
  costsPath(lanId);
  return {};
}

/** Undo a payment that was ticked by mistake: the two people in it, whoever ticked it, or a lead. */
export async function deleteSettlement(id: string) {
  const me = await requireUser();
  const s = db.select().from(costSettlement).where(eq(costSettlement.id, id)).get();
  if (!s) return;
  if (![s.fromUserId, s.toUserId, s.createdBy].includes(me.id) && !isLanManager(me, s.lanId)) throw await err("costs.errors.settle");
  db.delete(costSettlement).where(eq(costSettlement.id, id)).run();
  costsPath(s.lanId);
}
