import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test } from "./fixtures";

// The event cards on the home page say what to do next, not just how far the checklist is.
test.describe("home cards", () => {
  test("a card shows the next step and its deadline, then all set", async ({ as }, info) => {
    const open = createEvent({ name: `Next step ${Date.now()}`, attendees: [{ who: "anna", status: "going" }] });
    const done = createEvent({ name: `All set ${Date.now()}`, attendees: [{ who: "anna", status: "going", ticket: true }] });
    const unanswered = createEvent({ name: `Unanswered ${Date.now()}` });
    const page = await as("anna");
    await page.goto("/");

    const card = (id: string) => page.locator(`a[href="/lans/${id}"]`);
    await expect(card(open)).toContainText("Next: Buy your ticket");
    await expect(card(done)).toContainText("All set");
    await expect(card(unanswered)).toContainText(/Next: .+ · by /);
    // Numbers are icons with the sentence as tooltip.
    await expect(card(open).locator('[title$="going"]')).toBeVisible();
    await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  });

  test("a running event says so instead of 'a day ago'", async ({ as }) => {
    const id = createEvent({ name: `Running ${Date.now()}`, attendees: [{ who: "anna", ticket: true }] });
    db()
      .update(schema.lan)
      .set({ startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 86_400_000) })
      .where(eq(schema.lan.id, id))
      .run();
    const page = await as("anna");
    await page.goto("/");
    const card = page.locator(`a[href="/lans/${id}"]`);
    await expect(card).toContainText("happening now");
    await expect(card).not.toContainText("ago");
  });
});
