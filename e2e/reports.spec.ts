import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID, CLAN_SLUG } from "./env";
import { db, expect, test, userId } from "./fixtures";

const mine = () => db().select().from(schema.report).where(eq(schema.report.reporterId, userId("chiara"))).all();
test.afterEach(() => {
  db().delete(schema.report).where(eq(schema.report.reporterId, userId("chiara"))).run();
});

// A member reports their clan; the platform's moderators see it in the queue and resolve it.
test("a report reaches the moderators, who resolve it", async ({ as }) => {
  const chiara = await as("chiara");
  await chiara.goto(`/clans/${CLAN_SLUG}`);
  const open = chiara.getByRole("button", { name: "Report this clan" });
  await expect(async () => {
    await open.click();
    await expect(chiara.getByText("Your report goes to the people who run this Seatbit")).toBeVisible({ timeout: 2000 });
  }).toPass();
  // "Something else" needs a few words.
  await chiara.getByRole("radio", { name: "Something else" }).check();
  await chiara.getByRole("button", { name: "Send report" }).click();
  await expect(chiara.getByRole("list", { name: "Errors" })).toContainText("Tell us briefly what's wrong.");
  await chiara.getByRole("textbox", { name: /What's wrong/ }).fill("E2E: spam links in the description");
  await chiara.getByRole("button", { name: "Send report" }).click();
  await expect(chiara.getByText("Thanks, your report was sent to the moderators.")).toBeVisible();
  const [r] = mine();
  expect(r).toMatchObject({ clanId: CLAN_ID, reason: "other", status: "open" });

  const alex = await as("alex");
  await alex.goto("/admin/reports");
  // The card is the innermost element holding both our text and the handling form.
  const item = alex
    .locator("div, section, article")
    .filter({ hasText: "E2E: spam links in the description" })
    .filter({ has: alex.locator("form") })
    .last();
  await expect(item).toBeVisible();
  // Moderators don't learn who reported more than the queue shows; the clan never does.
  await item.getByRole("textbox", { name: "Note" }).fill("Removed the links");
  await item.getByRole("button", { name: "Resolve" }).click();
  await expect.poll(() => mine()[0]?.status).toBe("resolved");
  expect(mine()[0]).toMatchObject({ note: "Removed the links", handledBy: userId("alex") });
  await alex.goto("/admin/reports?tab=closed");
  await expect(alex.getByText("E2E: spam links in the description")).toBeVisible();
});
