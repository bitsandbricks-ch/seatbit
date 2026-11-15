import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

test.describe("event guide", () => {
  test("the checklist takes you to your next step", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], seatPicking: true, attendees: [{ who: "anna", ticket: true }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const checklist = anna.getByRole("region", { name: "Your checklist" });
    await expect(checklist.getByText("Next")).toBeVisible();
    await checklist.getByRole("link", { name: "Pick a seat" }).click();
    await expect(anna).toHaveURL(new RegExp(`/lans/${id}\\?tab=seats$`));
    await expect(anna.getByRole("link", { name: /^Seats/, exact: false }).first()).toHaveAttribute("aria-current", "page");
  });

  test("travel, packing, games, food and costs live in one Trip tab", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
    db().insert(schema.travelPost).values({ lanId: id, userId: userId("ben"), kind: "ride", mode: "request", town: "Zug" }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const sections = anna.getByRole("navigation", { name: "Sections" });
    await expect(sections.getByRole("link")).toHaveCount(4);

    // The extra under the checklist leads straight into the Trip tab's travel section.
    await anna.getByRole("region", { name: "Your checklist" }).getByRole("link", { name: "1 needs a ride" }).click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=travel$`));
    await expect(sections.getByRole("link", { name: /^Trip/ })).toHaveAttribute("aria-current", "page");

    await anna.getByRole("group", { name: "Trip sections" }).getByRole("link", { name: "Costs" }).click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=costs$`));
    await expect(sections.getByRole("link", { name: /^Trip/ })).toHaveAttribute("aria-current", "page");
  });

  test("food orders sit in an On site tab that members get only while the event runs", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const sections = anna.getByRole("navigation", { name: "Sections" });
    await expect(sections.getByRole("link", { name: /^On site/ })).toHaveCount(0);
    await anna.goto(`/lans/${id}?tab=food`);
    await expect(anna.getByText("Food orders show up here once the event starts.")).toBeVisible();

    // Leads can set an order up before the event.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}`);
    await expect(alex.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^On site/ })).toBeVisible();

    // The event starts: members get the tab right after Overview.
    const now = Date.now();
    db().update(schema.lan).set({ startsAt: new Date(now - 3600_000), endsAt: new Date(now + 86400_000) }).where(eq(schema.lan.id, id)).run();
    await anna.goto(`/lans/${id}`);
    await expect(sections.getByRole("link").nth(1)).toHaveText(/^On site/);
    await sections.getByRole("link", { name: /^On site/ }).click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=food$`));
    await expect(anna.getByText("Food orders show up here once the event starts.")).toHaveCount(0);
  });
});
