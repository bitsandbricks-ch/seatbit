import { eq } from "drizzle-orm";
import { costExpense, costSettlement } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

test("shared costs: a member logs an expense, another pays them back, the balance is even", async ({ as }) => {
  const lanId = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });

  // Anna paid CHF 30 for snacks, split between her and Ben.
  const anna = await as("anna");
  await anna.goto(`/lans/${lanId}?tab=costs`);
  await anna.locator('input[name="title"]').fill("Snacks");
  await anna.locator('input[name="amount"]').fill("30");
  await anna.getByRole("button", { name: "Nobody" }).click();
  await anna.getByRole("checkbox", { name: "You", exact: true }).check();
  await anna.getByRole("checkbox", { name: /Ben/ }).check();
  await anna.getByRole("button", { name: "Add expense", exact: true }).click();
  await expect(anna.getByText("You get CHF 15.00 back in total.")).toBeVisible();
  expect(db().select().from(costExpense).where(eq(costExpense.lanId, lanId)).get()).toMatchObject({ amountCents: 3000, paidBy: userId("anna") });

  // Ben sees what he owes, also on the tab, and marks it paid.
  const ben = await as("ben");
  await ben.goto(`/lans/${lanId}?tab=costs`);
  await expect(ben.getByText("CHF 15.00 to pay")).toBeVisible();
  await expect(ben.getByText("You owe CHF 15.00 in total.")).toBeVisible();
  await ben.getByRole("button", { name: "Mark as paid" }).click();
  await expect(ben.getByText("You're even.")).toBeVisible();
  expect(db().select().from(costSettlement).where(eq(costSettlement.lanId, lanId)).get()).toMatchObject({
    fromUserId: userId("ben"),
    toUserId: userId("anna"),
    amountCents: 1500,
  });

  // Anna sees it settled.
  await anna.reload();
  await expect(anna.getByText("Everyone is even.").first()).toBeVisible();
});

test("shared costs: someone who didn't answer can't log expenses", async ({ as }) => {
  const lanId = createEvent({ attendees: [{ who: "anna" }] });
  const david = await as("david");
  await david.goto(`/lans/${lanId}?tab=costs`);
  // David (a plain member) never answered: no form for him.
  await expect(david.getByRole("button", { name: "Add expense" })).toHaveCount(0);
});
