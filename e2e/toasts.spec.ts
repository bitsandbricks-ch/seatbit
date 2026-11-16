import { and, eq } from "drizzle-orm";
import { attendance, user } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

// Toasts: the note at the bottom after a save, and the reason when it failed.
test.describe("toasts", () => {
  test("a save shows a note at the bottom", async ({ as }) => {
    const page = await as("anna");
    await page.goto("/profile?tab=notifications");
    // Saves as soon as the box changes, no Save button.
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    const reminders = () => db().select().from(user).where(eq(user.id, userId("anna"))).get()?.emailReminders;
    const before = reminders();
    await page.getByRole("checkbox", { name: /Email reminders/ }).click();

    const notes = page.getByRole("list", { name: "Notifications" });
    await expect(notes.getByText("Saved.")).toBeVisible();
    await notes.getByRole("button", { name: "Close" }).click();
    await expect(notes.getByText("Saved.")).toHaveCount(0);
    await expect.poll(reminders).toBe(!before);
  });

  test("a nick saves when the field loses focus", async ({ as }) => {
    const page = await as("anna");
    await page.goto("/profile?tab=lans");
    const nick = page.getByRole("textbox", { name: "Nickname" }).first();
    await nick.fill(`Nova${Date.now() % 10000}`);
    await nick.blur();
    await expect(page.getByRole("list", { name: "Notifications" }).getByText("Saved.")).toBeVisible();
  });

  test("a failed save shows the reason instead of an error page", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna", status: "going" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    // The ticket gets ticked elsewhere (a lead, Discord) while the page is open.
    db()
      .update(attendance)
      .set({ ticketBought: true })
      .where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna"))))
      .run();

    await page.getByRole("region", { name: "Your attendance" }).getByRole("button", { name: "Not coming" }).click();

    // The server's own (translated) text, also in a production build.
    await expect(page.getByRole("list", { name: "Errors" }).getByText("You have a ticket, so your answer is locked.", { exact: false })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your attendance" })).toBeVisible();
  });
});
