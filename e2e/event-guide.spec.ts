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
});
