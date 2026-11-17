import { expect, test } from "./fixtures";

// Platform staff open a user from the admin list and see their account, clans, events and nicks.
test("platform staff see a user's details", async ({ as }) => {
  const alex = await as("alex");
  await alex.goto("/admin");
  await alex.getByRole("link", { name: /Ben .*Huber/ }).first().click();
  await expect(alex).toHaveURL(/\/admin\/users\/demo-ben$/);
  await expect(alex.getByRole("heading", { name: "Clans" })).toBeVisible();
  await expect(alex.locator('a[href="/clans/pixel-pirates/members/demo-ben"]')).toBeVisible();
  await expect(alex.getByRole("link", { name: /Lakeside LAN/ }).first()).toBeVisible();
  // Owners also see the LAN IDs, next to the nicks.
  await expect(alex.getByText("ID 41250")).toBeVisible();
  await expect(alex.getByText("Byte").first()).toBeVisible();
});

test("members can't open a user's admin page", async ({ as }) => {
  const anna = await as("anna");
  await anna.goto("/admin/users/demo-ben");
  await expect(anna).not.toHaveURL(/\/admin/);
});
