import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { charge, chargeItem } from "../src/db/schema";
import { CLAN_SLUG } from "./env";
import { db, expect, test, userId } from "./fixtures";

const lineOf = (title: string) => {
  const c = db().select().from(charge).where(eq(charge.title, title)).get();
  return c && db().select().from(chargeItem).where(and(eq(chargeItem.chargeId, c.id), eq(chargeItem.userId, userId("anna")))).get();
};

test("clan payments: a lead charges a member, the member reports paying, the lead ticks it off", async ({ as }) => {
  const title = `Jerseys ${crypto.randomUUID().slice(0, 6)}`;

  // Alex creates a charge for Anna, without telling her by mail.
  const alex = await as("alex");
  await alex.goto(`/clans/${CLAN_SLUG}/payments/new`);
  await alex.getByRole("group", { name: "What for" }).getByRole("button", { name: "Other" }).click();
  await alex.locator('input[name="title"]').fill(title);
  await alex.getByRole("group", { name: "Who pays" }).getByRole("button", { name: /Pick people/ }).click();
  await alex.getByRole("checkbox", { name: /Anna/ }).check();
  await alex.locator('input[name="amount"]').fill("12.50");
  await alex.getByRole("checkbox", { name: /Tell everyone on it now/ }).uncheck();
  await alex.getByRole("button", { name: "Create charge" }).click();
  await expect(alex.getByRole("heading", { name: title })).toBeVisible();
  expect(lineOf(title)).toMatchObject({ amountCents: 1250, status: "open" });

  // Anna sees it on the clan page and says she paid.
  const anna = await as("anna");
  await anna.goto(`/clans/${CLAN_SLUG}?tab=payments`);
  const row = anna.getByRole("listitem").filter({ hasText: title });
  await expect(row).toContainText("CHF 12.50");
  await row.getByRole("button", { name: "I've paid" }).click();
  await expect.poll(() => lineOf(title)?.status).toBe("reported");

  // Alex checks and marks it paid in cash.
  await alex.reload();
  await expect(alex.getByText("Says paid").first()).toBeVisible();
  await alex.getByRole("button", { name: "Paid (Cash)" }).click();
  await expect.poll(() => lineOf(title)?.status).toBe("paid");
  expect(lineOf(title)?.paidVia).toBe("cash");

  // Anna's line moved to "Paid".
  await anna.reload();
  await expect(anna.getByRole("listitem").filter({ hasText: title }).getByRole("button", { name: "I've paid" })).toHaveCount(0);
});
