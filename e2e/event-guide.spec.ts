import { eq } from "drizzle-orm";
import type { Page } from "@playwright/test";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const tabs = (p: Page) => p.getByRole("navigation", { name: "Sections" });
const glance = (p: Page) => p.locator("section", { has: p.getByRole("heading", { name: "At a glance" }) });

test.describe("event guide", () => {
  test("the checklist takes you to your next step without reloading the page", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], seatPicking: true, attendees: [{ who: "anna", ticket: true }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    // A marker on window survives client-side switching but not a page load.
    await anna.evaluate(() => ((window as unknown as { stay: boolean }).stay = true));
    const checklist = anna.getByRole("region", { name: "Your checklist" });
    // Folded, it shows only the next step; open, every step.
    await expect(checklist.getByText("Say you're coming")).toHaveCount(0);
    await checklist.getByRole("button", { name: /Show all steps/ }).click();
    await expect(checklist.getByText("Say you're coming")).toBeVisible();
    await checklist.getByRole("button", { name: /Show fewer steps/ }).click();
    await expect(checklist.getByText("Say you're coming")).toHaveCount(0);
    await checklist.getByRole("link", { name: "Pick a seat" }).click();
    await expect(anna).toHaveURL(new RegExp(`/lans/${id}\\?tab=seats$`));
    await expect(tabs(anna).getByRole("link", { name: /^Seats/ })).toHaveAttribute("aria-current", "page");
    await expect(anna.getByRole("heading", { name: "Our seats" })).toBeVisible();
    expect(await anna.evaluate(() => (window as unknown as { stay?: boolean }).stay)).toBe(true);

    // Tapping a seat shows its details above the map.
    await anna.getByRole("button", { name: /^Seat A2/ }).click();
    await expect(anna.getByRole("button", { name: "Take this seat" })).toBeVisible();

    // Back goes to the overview again.
    await anna.goBack();
    await expect(anna).toHaveURL(new RegExp(`/lans/${id}$`));
    await expect(anna.getByRole("heading", { name: "Our seats" })).toBeHidden();
    await expect(glance(anna)).toBeVisible();
  });

  test("the overview says at a glance why you'd open a tab", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
    db().insert(schema.travelPost).values({ lanId: id, userId: userId("ben"), kind: "ride", mode: "request", town: "Zug" }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const travel = glance(anna).getByRole("link", { name: /^Travel/ });
    await expect(travel).toContainText("1 looking");
    await expect(glance(anna).getByRole("link", { name: /^Attendees/ })).toContainText("2 coming");

    await travel.click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=travel$`));
    await expect(tabs(anna).getByRole("link", { name: /^Trip/ })).toHaveAttribute("aria-current", "page");
    await expect(anna.getByRole("group", { name: "Trip sections" }).getByRole("link", { name: "Travel" })).toHaveAttribute("aria-current", "true");
    await expect(anna.getByText("Zug")).toBeVisible();

    // The Trip tab opens its first part; old links to it still work.
    await anna.goto(`/lans/${id}?tab=trip`);
    await expect(anna.getByText("Zug")).toBeVisible();
  });

  test("food orders sit in an On site tab that members get only while the event runs", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await expect(tabs(anna).getByRole("link", { name: /^Trip/ })).toBeVisible();
    await expect(tabs(anna).getByRole("link", { name: /^On site/ })).toHaveCount(0);
    await anna.goto(`/lans/${id}?tab=food`);
    await expect(anna.getByText("Food orders show up here once the event starts.")).toBeVisible();

    // Leads can set an order up before the event.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}`);
    await expect(tabs(alex).getByRole("link", { name: /^On site/ })).toBeVisible();

    // The event starts: members get it too.
    const now = Date.now();
    db().update(schema.lan).set({ startsAt: new Date(now - 3600_000), endsAt: new Date(now + 86400_000) }).where(eq(schema.lan.id, id)).run();
    await anna.goto(`/lans/${id}`);
    await tabs(anna).getByRole("link", { name: /^On site/ }).click();
    await expect(anna).toHaveURL(new RegExp(`\\?tab=food$`));
    await expect(anna.getByText("Food orders show up here once the event starts.")).toHaveCount(0);
  });
});
