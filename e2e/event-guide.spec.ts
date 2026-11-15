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
    await expect(anna.getByRole("heading", { name: "Seats", exact: true })).toBeVisible();
  });

  test("the sections are rows that say why you'd open them", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
    db().insert(schema.travelPost).values({ lanId: id, userId: userId("ben"), kind: "ride", mode: "request", town: "Zug" }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const sections = anna.getByRole("navigation", { name: "Sections" });
    const travel = sections.getByRole("link", { name: /^Travel/ });
    await expect(travel).toContainText("1 looking");
    await expect(sections.getByRole("link", { name: /^Attendees/ })).toContainText("2 coming");

    await travel.click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=travel$`));
    await expect(anna.getByRole("heading", { name: "Travel", exact: true })).toBeVisible();
    // Old links to the former Trip tab still land on travel.
    await anna.goto(`/lans/${id}?tab=trip`);
    await expect(anna.getByRole("heading", { name: "Travel", exact: true })).toBeVisible();
  });

  test("food orders sit in an On site section that members get only while the event runs", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const sections = anna.getByRole("navigation", { name: "Sections" });
    await expect(sections.getByRole("link", { name: /^Travel/ })).toBeVisible();
    await expect(sections.getByRole("link", { name: /^On site/ })).toHaveCount(0);
    await anna.goto(`/lans/${id}?tab=food`);
    await expect(anna.getByText("Food orders show up here once the event starts.")).toBeVisible();

    // Leads can set an order up before the event.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}`);
    await expect(alex.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: /^On site/ })).toBeVisible();

    // The event starts: members get it too.
    const now = Date.now();
    db().update(schema.lan).set({ startsAt: new Date(now - 3600_000), endsAt: new Date(now + 86400_000) }).where(eq(schema.lan.id, id)).run();
    await anna.goto(`/lans/${id}`);
    await sections.getByRole("link", { name: /^On site/ }).click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=food$`));
    await expect(anna.getByText("Food orders show up here once the event starts.")).toHaveCount(0);
  });
});
