import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_SLUG } from "./env";
import { db, expect, test } from "./fixtures";

const created: string[] = [];
test.afterEach(() => {
  for (const id of created.splice(0)) db().delete(schema.lan).where(eq(schema.lan.id, id)).run();
});

// A lead creates an event by typing the dates, it stays hidden as a draft, and members see it once published.
test("a lead creates a draft and publishes it", async ({ as }) => {
  const name = `Created ${Date.now()}`;
  const alex = await as("alex");
  await alex.goto(`/clans/${CLAN_SLUG}/lans/new`);
  await alex.getByLabel("Event name").fill(name);
  // The date fields are found by their own names, not a shared placeholder.
  const starts = alex.getByRole("textbox", { name: "Starts", exact: true });
  await starts.fill("14.12.2027 10:00");
  await starts.blur();
  const ends = alex.getByRole("textbox", { name: "Ends", exact: true });
  await expect(ends).not.toHaveValue("");
  await ends.fill("16.12.2027 16:00");
  await ends.blur();
  await alex.getByRole("button", { name: "Save as draft" }).click();
  await alex.waitForURL(/\/lans\/[^/]+\/manage/);

  const lan = db().select().from(schema.lan).where(eq(schema.lan.name, name)).get()!;
  created.push(lan.id);
  expect(lan.publishedAt).toBeNull();
  // The server runs in Europe/Zurich (playwright.config.ts): 10:00 there is 09:00 UTC in winter.
  expect(lan.startsAt.toISOString()).toBe("2027-12-14T09:00:00.000Z");
  expect(lan.endsAt.toISOString()).toBe("2027-12-16T15:00:00.000Z");
  // "Answer by" moved along with the start by whole days and kept its 23:59.
  expect(lan.signupDeadline?.toISOString()).toMatch(/T22:59:00/);

  const anna = await as("anna");
  await anna.goto(`/lans/${lan.id}`);
  await expect(anna.getByText("404", { exact: true })).toBeVisible();
  await expect(anna.getByRole("heading", { name })).toHaveCount(0);

  await alex.goto(`/lans/${lan.id}`);
  await alex.getByRole("button", { name: "Publish now" }).click();
  await alex.getByRole("button", { name: "Yes, publish" }).click();
  await expect.poll(() => db().select().from(schema.lan).where(eq(schema.lan.id, lan.id)).get()?.publishedAt).not.toBeNull();

  await anna.goto(`/lans/${lan.id}`);
  await expect(anna.getByRole("heading", { name })).toBeVisible();
});
