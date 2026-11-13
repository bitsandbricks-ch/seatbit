import { and, eq } from "drizzle-orm";
import { attendance } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

// Toasts: the note at the bottom after a save, and the reason when it failed.
test.describe("toasts", () => {
  test("a save shows a note at the bottom", async ({ as }) => {
    const page = await as("anna");
    await page.goto("/profile?tab=notifications");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    const notes = page.getByRole("list", { name: "Notifications" });
    await expect(notes.getByText("Saved.")).toBeVisible();
    await notes.getByRole("button", { name: "Close" }).click();
    await expect(notes.getByText("Saved.")).toHaveCount(0);
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
