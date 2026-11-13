import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { settleUp, type CostExpenseView, type CostSettlementView } from "./costs-math";

/**
 * Shared costs at an event: someone pays for the group (tickets, fuel, snacks), says who it's
 * split between, and Seatbit works out who owes whom. People tick off what they paid back.
 * No money goes through Seatbit. Money owed to the clan itself is clan payments (payments.ts).
 */

const { costExpense, costShare, costSettlement } = schema;

/** Most expenses one event takes, so a runaway script can't fill the table. */
export const MAX_EXPENSES = 200;

/** An event's expenses (newest first), settlements and the resulting balances. */
export function eventCosts(lanId: string) {
  const rows = db.select().from(costExpense).where(eq(costExpense.lanId, lanId)).orderBy(asc(costExpense.createdAt)).all();
  const shares = rows.length
    ? db.select().from(costShare).where(inArray(costShare.expenseId, rows.map((r) => r.id))).all()
    : [];
  const expenses: CostExpenseView[] = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      note: r.note,
      amountCents: r.amountCents,
      paidBy: r.paidBy,
      createdBy: r.createdBy,
      createdAt: r.createdAt.toISOString(),
      shares: shares.filter((s) => s.expenseId === r.id).map((s) => ({ userId: s.userId, amountCents: s.amountCents })),
    }))
    .reverse();
  const settlements: CostSettlementView[] = db
    .select()
    .from(costSettlement)
    .where(eq(costSettlement.lanId, lanId))
    .orderBy(asc(costSettlement.createdAt))
    .all()
    .map((s) => ({
      id: s.id,
      fromUserId: s.fromUserId,
      toUserId: s.toUserId,
      amountCents: s.amountCents,
      createdBy: s.createdBy,
      createdAt: s.createdAt.toISOString(),
    }))
    .reverse();
  return { expenses, settlements, ...settleUp(expenses, settlements) };
}

/**
 * Who can pay or share in an event's costs: everyone with an answer (also "not coming": they may
 * have paid a deposit before dropping out) and the event's leads.
 */
export function costPeople(lanId: string) {
  const answered = db.select({ id: schema.attendance.userId }).from(schema.attendance).where(eq(schema.attendance.lanId, lanId)).all();
  const leads = db.select({ id: schema.lanOrga.userId }).from(schema.lanOrga).where(eq(schema.lanOrga.lanId, lanId)).all();
  return new Set([...answered, ...leads].map((r) => r.id));
}
