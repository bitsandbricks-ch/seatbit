import assert from "node:assert/strict";
import { test } from "node:test";
import { settleUp, type CostExpenseView, type CostSettlementView } from "./costs-math";

const expense = (paidBy: string, amountCents: number, shares: [string, number][]): CostExpenseView => ({
  id: `${paidBy}-${amountCents}`,
  title: "x",
  note: "",
  amountCents,
  paidBy,
  createdBy: paidBy,
  createdAt: "2026-11-13T00:00:00.000Z",
  shares: shares.map(([userId, c]) => ({ userId, amountCents: c })),
});
const paid = (fromUserId: string, toUserId: string, amountCents: number): CostSettlementView => ({
  id: `${fromUserId}-${toUserId}`,
  fromUserId,
  toUserId,
  amountCents,
  createdBy: fromUserId,
  createdAt: "2026-11-13T00:00:00.000Z",
});

test("settleUp: balances add up to zero and transfers even them out", () => {
  const r = settleUp(
    [
      expense("ben", 6000, [["ben", 1500], ["anna", 1500], ["chiara", 1500], ["lea", 1500]]),
      expense("anna", 900, [["anna", 300], ["ben", 300], ["lea", 300]]),
    ],
    [],
  );
  assert.equal(r.totalCents, 6900);
  assert.equal([...r.balances.values()].reduce((a, b) => a + b, 0), 0);
  assert.equal(r.balances.get("ben"), 4200);
  assert.equal(r.balances.get("anna"), -900);
  // Applying the transfers leaves everyone even.
  const after = new Map(r.balances);
  for (const t of r.transfers) {
    after.set(t.from, after.get(t.from)! + t.amountCents);
    after.set(t.to, after.get(t.to)! - t.amountCents);
  }
  assert.ok([...after.values()].every((b) => b === 0));
  assert.ok(r.transfers.length <= 3);
  assert.ok(r.transfers.every((t) => t.to === "ben"));
});

test("settleUp: a recorded payment counts, and nothing is left when everyone paid", () => {
  const e = [expense("ben", 2000, [["ben", 1000], ["anna", 1000]])];
  assert.deepEqual(settleUp(e, []).transfers, [{ from: "anna", to: "ben", amountCents: 1000 }]);
  assert.deepEqual(settleUp(e, [paid("anna", "ben", 400)]).transfers, [{ from: "anna", to: "ben", amountCents: 600 }]);
  const done = settleUp(e, [paid("anna", "ben", 1000)]);
  assert.deepEqual(done.transfers, []);
  assert.ok([...done.balances.values()].every((b) => b === 0));
});

test("settleUp: the payer outside the split gets the whole amount back", () => {
  const r = settleUp([expense("alex", 1000, [["anna", 500], ["ben", 500]])], []);
  assert.equal(r.balances.get("alex"), 1000);
  assert.equal(r.transfers.length, 2);
});
