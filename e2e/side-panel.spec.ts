import { createEvent, expect, test } from "./fixtures";

// Members open in a side panel next to the list; the URL is the member's page, Back closes it.
test.describe("side panel", () => {
  test("a member opens beside the list and closes again", async ({ as }, info) => {
    const page = await as("anna");
    await page.goto("/clans/pixel-pirates?tab=members");
    const list = page.getByRole("main");
    await list.getByRole("link", { name: /Ben/ }).filter({ visible: true }).first().click();

    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/\/clans\/pixel-pirates\/members\/demo-ben$/);
    await expect(panel.getByRole("heading", { name: /Ben/ })).toBeVisible();
    await page.screenshot({ path: `test-results/side-panel-${info.project.name}.png` });

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/\/clans\/pixel-pirates\?tab=members$/);
    await expect(list.getByRole("link", { name: /Ben/ }).filter({ visible: true }).first()).toBeVisible();
  });

  test("the same link loaded directly is a full page", async ({ as }) => {
    const page = await as("anna");
    await page.goto("/clans/pixel-pirates/members/demo-ben");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: /Ben/ })).toBeVisible();
  });

  test("an attendee opens beside the event, and the event stays on its tab", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}?tab=attendees`);
    await page.getByRole("main").getByRole("link", { name: /Ben/ }).filter({ visible: true }).first().click();

    const panel = page.getByRole("dialog");
    await expect(panel.getByRole("heading", { name: /Ben/ })).toBeVisible();
    await expect(page).toHaveURL(/\/clans\/pixel-pirates\/members\/demo-ben$/);

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/lans/${id}\\?tab=attendees$`));
  });

  test("after closing it, going on to Manage shows no panel", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "alex" }, { who: "ben" }] });
    const page = await as("alex");
    await page.goto(`/lans/${id}?tab=attendees`);
    await page.getByRole("main").getByRole("link", { name: /Ben/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    // A soft navigation to Manage must not bring the old panel back.
    await page.getByRole("link", { name: "Manage" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/lans/${id}/manage`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
