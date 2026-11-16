import { createEvent, expect, test } from "./fixtures";

test("the Lead page switches tabs without reloading and groups attendee views", async ({ as }) => {
  const id = createEvent({ attendees: [{ who: "anna" }] });

  const alex = await as("alex");
  await alex.goto(`/lans/${id}/manage`);
  // A marker on window survives client-side switching but not a page load.
  await alex.evaluate(() => ((window as unknown as { stay: boolean }).stay = true));
  const tabs = alex.getByRole("navigation", { name: "Sections" });

  await tabs.getByRole("link", { name: /^People/ }).click();
  await expect(alex).toHaveURL(new RegExp(`/manage\\?tab=attendees$`));
  const views = alex.getByRole("group", { name: "Attendee views" });
  await views.getByRole("link", { name: "Who's missing" }).click();
  await expect(alex).toHaveURL(new RegExp(`/manage\\?tab=missing$`));
  await expect(tabs.getByRole("link", { name: /^People/ })).toHaveAttribute("aria-current", "page");

  // News and reminders live with the chat tools now, not on the overview.
  await tabs.getByRole("link", { name: /^News/ }).click();
  await expect(alex.getByRole("heading", { name: "News for attendees" })).toBeVisible();
  await expect(alex.getByRole("heading", { name: "Reminders" })).toBeVisible();
  expect(await alex.evaluate(() => (window as unknown as { stay?: boolean }).stay)).toBe(true);

  await tabs.getByRole("link", { name: /^Overview/ }).click();
  await expect(alex.getByRole("heading", { name: "News for attendees" })).toBeHidden();
});
