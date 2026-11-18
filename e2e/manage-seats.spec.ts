import { createEvent, expect, test } from "./fixtures";

const tabs = (p: import("@playwright/test").Page) => p.getByRole("navigation", { name: "Sections" });

test.describe("organizer seats and overview", () => {
  test("the seat block is set up on the Seats tab first, then lives in Settings", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByLabel("Seats the event gave us").fill("A1-A3");
    await alex.getByRole("button", { name: "Save seats" }).click();
    await expect(alex.getByText("Saved 3 seats.")).toBeVisible();

    // Daily tools stay on Seats, the block moves to Settings.
    await alex.reload();
    const planner = alex.locator("#planner");
    await expect(planner.getByRole("button", { name: "Fill free seats" })).toBeVisible();
    await expect(planner.getByText("3 seats: A1-A3.")).toBeVisible();
    await expect(alex.getByLabel("Seats the event gave us")).toBeHidden();
    await planner.getByRole("link", { name: "Change in Settings" }).click();
    await expect(alex.locator("#our-seats").getByLabel("Seats the event gave us")).toHaveValue("A1-A3");
  });

  test("plan variants and history are folded until opened", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], attendees: [{ who: "anna" }] });
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    const tools = alex.locator("#planning-tools");
    await expect(tools.locator("#seat-variants")).toBeHidden();
    await tools.locator("summary").click();
    await expect(tools.locator("#seat-variants")).toBeVisible();
  });

  test("the overview doesn't repeat the checklist's ticket and seat numbers", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], attendees: [{ who: "anna" }] });
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage`);
    await expect(alex.getByText("Organizer checklist").first()).toBeVisible();
    await expect(alex.getByRole("link", { name: /^Coming/ })).toBeVisible();
    await expect(alex.getByRole("link", { name: /^Tickets/ })).toHaveCount(0);
    await expect(tabs(alex).getByRole("link", { name: /^Seats/ })).toBeVisible();
  });
});
