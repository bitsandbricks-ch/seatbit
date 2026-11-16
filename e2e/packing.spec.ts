import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const DAY = 86_400_000;

// Your own packing items come along from your earlier LANs, one at a time or all at once.
test.describe("packing list", () => {
  test("own items from an earlier LAN are offered again", async ({ as }) => {
    const before = createEvent({ name: `Before ${Date.now()}`, attendees: [{ who: "anna" }] });
    const next = createEvent({ attendees: [{ who: "anna" }] });
    db()
      .update(schema.lan)
      .set({ startsAt: new Date(Date.now() - 200 * DAY), endsAt: new Date(Date.now() - 198 * DAY) })
      .where(eq(schema.lan.id, before))
      .run();
    const anna = userId("anna");
    db()
      .insert(schema.packingItem)
      .values([
        { lanId: before, userId: anna, label: "Spare mouse" },
        { lanId: before, userId: anna, label: "Earplugs" },
        { lanId: before, userId: anna, label: "Fan" },
        { lanId: next, userId: anna, label: "fan" },
      ])
      .run();

    const page = await as("anna");
    await page.goto(`/lans/${next}?tab=gear`);
    // "Fan" is on the list already (any case).
    await expect(page.getByRole("button", { name: "Add Fan again" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add Spare mouse again" }).click();
    await expect(page.getByRole("checkbox", { name: "Spare mouse" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Spare mouse again" })).toHaveCount(0);
    // Only one left: no "Add all" for a single item.
    await expect(page.getByRole("button", { name: "Add all" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add Earplugs again" }).click();
    await expect(page.getByRole("checkbox", { name: "Earplugs" })).toBeVisible();
    await expect(page.getByRole("region", { name: "From your earlier LANs" })).toHaveCount(0);
  });

  test("add all takes everything over at once", async ({ as }) => {
    const before = createEvent({ name: `Before ${Date.now()}`, attendees: [{ who: "ben" }] });
    const next = createEvent({ attendees: [{ who: "ben" }] });
    db()
      .update(schema.lan)
      .set({ startsAt: new Date(Date.now() - 100 * DAY), endsAt: new Date(Date.now() - 98 * DAY) })
      .where(eq(schema.lan.id, before))
      .run();
    db()
      .insert(schema.packingItem)
      .values([
        { lanId: before, userId: userId("ben"), label: "Gamepad" },
        { lanId: before, userId: userId("ben"), label: "Pillow" },
      ])
      .run();
    const page = await as("ben");
    await page.goto(`/lans/${next}?tab=gear`);
    await page.getByRole("button", { name: "Add all" }).click();
    await expect(page.getByRole("checkbox", { name: "Gamepad" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Pillow" })).toBeVisible();
    await expect(page.getByRole("region", { name: "From your earlier LANs" })).toHaveCount(0);
  });
});
