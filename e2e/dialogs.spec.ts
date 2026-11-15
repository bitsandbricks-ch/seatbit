import { and, eq } from "drizzle-orm";
import { attendance, lan } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

// The app's own confirm dialog (src/components/dialog.tsx) instead of the browser's confirm().
test.describe("confirm dialogs", () => {
  test("removing an attendee asks first; Cancel and Escape keep them", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    const row = () =>
      db().select().from(attendance).where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna")))).get();
    const page = await as("alex");
    // A browser dialog would fail the test: Playwright dismisses it silently.
    page.on("dialog", (d) => {
      throw new Error(`browser dialog: ${d.message()}`);
    });
    await page.goto(`/lans/${id}/manage?tab=attendees`);

    const remove = page.getByRole("main").getByRole("button", { name: "Remove", exact: true }).filter({ visible: true }).first();
    const dialog = page.getByRole("dialog");

    await remove.click();
    await expect(dialog.getByRole("heading", { name: /^Remove .* from this LAN\?$/ })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();

    await remove.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    expect(row()).toBeTruthy();

    await remove.click();
    await dialog.getByRole("button", { name: "Remove", exact: true }).click();
    await expect.poll(row).toBeUndefined();
  });

  test("deleting an event asks first, then deletes it", async ({ as }) => {
    const id = createEvent({ name: "Dialog Test LAN" });
    const exists = () => !!db().select().from(lan).where(eq(lan.id, id)).get();
    const page = await as("alex");
    await page.goto(`/lans/${id}/manage?tab=settings`);
    await page.getByRole("button", { name: "Delete this LAN" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Delete Dialog Test LAN?" })).toBeVisible();
    // A delete starts on Cancel, so Enter can't delete by accident.
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(exists()).toBe(true);

    await page.getByRole("button", { name: "Delete this LAN" }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect.poll(exists).toBe(false);
  });
});
