import { createEvent, expect, test } from "./fixtures";

// Quick search: Ctrl+K, type, Enter opens the result. Only the person's own clans are searched.
test.describe("quick search", () => {
  test("finds an event and a clanmate and opens them", async ({ as }) => {
    const token = `Findme${Math.random().toString(36).slice(2, 8)}`;
    const name = `Searchable ${token}`;
    const id = createEvent({ name });
    const page = await as("anna");
    await page.goto("/");

    await page.keyboard.press("Control+k");
    const box = page.getByRole("combobox", { name: "Search events, people and clans" });
    await expect(box).toBeFocused();
    await box.fill(token.toLowerCase());
    await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible();
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/lans/${id}$`));

    await page.getByRole("button", { name: "Search events, people and clans" }).click();
    await box.fill("byte");
    await page.getByRole("option", { name: /Ben "Byte" Huber/ }).click();
    await expect(page).toHaveURL(/\/clans\/pixel-pirates\/members\/demo-ben$/);
  });

  test("says when nothing matches", async ({ as }) => {
    const page = await as("anna");
    await page.goto("/");
    await page.getByRole("button", { name: "Search events, people and clans" }).click();
    await page.getByRole("combobox").fill("zzzz-nothing");
    await expect(page.getByText("Nothing found for “zzzz-nothing”.")).toBeVisible();
  });
});
