// Shared costs maths without database imports, so client components can use the types too.

export type CostExpenseView = {
  id: string;
  title: string;
  note: string;
  amountCents: number;
  paidBy: string;
  createdBy: string | null;
  /** ISO time, so it passes to client components as is. */
  createdAt: string;
  shares: { userId: string; amountCents: number }[];
};

export type CostSettlementView = {
  id: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  createdBy: string | null;
  createdAt: string;
};

export type Transfer = { from: string; to: string; amountCents: number };

/**
 * Everyone's balance (positive: gets money back, negative: owes) and the fewest transfers that
 * even it out. Paying back counts like paying: the one who pays goes up, the one who gets it down.
 */
export function settleUp(expenses: CostExpenseView[], settlements: CostSettlementView[]) {
  const balances = new Map<string, number>();
  const add = (id: string, cents: number) => balances.set(id, (balances.get(id) ?? 0) + cents);
  for (const e of expenses) {
    add(e.paidBy, e.amountCents);
    for (const s of e.shares) add(s.userId, -s.amountCents);
  }
  for (const s of settlements) {
    add(s.fromUserId, s.amountCents);
    add(s.toUserId, -s.amountCents);
  }

  // Greedy: the biggest debtor pays the biggest creditor until one of them is even. At most n-1
  // transfers, and in practice close to the minimum, which is all a LAN group needs.
  const debtors = [...balances].filter(([, b]) => b < 0).map(([id, b]) => ({ id, left: -b }));
  const creditors = [...balances].filter(([, b]) => b > 0).map(([id, b]) => ({ id, left: b }));
  const byLeft = (a: { id: string; left: number }, b: { id: string; left: number }) => b.left - a.left || a.id.localeCompare(b.id);
  const transfers: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byLeft);
    creditors.sort(byLeft);
    const d = debtors[0];
    const c = creditors[0];
    const amountCents = Math.min(d.left, c.left);
    transfers.push({ from: d.id, to: c.id, amountCents });
    d.left -= amountCents;
    c.left -= amountCents;
    if (!d.left) debtors.shift();
    if (!c.left) creditors.shift();
  }

  const totalCents = expenses.reduce((n, e) => n + e.amountCents, 0);
  return { balances, transfers, totalCents };
}
