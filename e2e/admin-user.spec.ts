import { expect, test } from "./fixtures";

// Platform staff open a user from the admin list and see their account, clans, events and nicks.
test("platform staff see a user's details", async ({ as }) => {
  const alex = await as("alex");
  await alex.goto("/admin/users");
  await alex.getByRole("searchbox", { name: "Search name, nick, email or Discord" }).fill("byte");
  await expect(alex.getByRole("link", { name: /Huber/ })).toHaveCount(1);
  await alex.getByRole("link", { name: /Ben .*Huber/ }).click();
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

test("the user list filters guests and finds nobody for nonsense", async ({ as }) => {
  const alex = await as("alex");
  await alex.goto("/admin/users");
  await alex.getByRole("button", { name: /^Guests/ }).click();
  await expect(alex.getByText("Guest of Pixel Pirates").first()).toBeVisible();
  await expect(alex.getByText("ben@example.com")).toHaveCount(0);
  await alex.getByRole("button", { name: /^All/ }).click();
  await alex.getByRole("searchbox").fill("zzzz-nobody");
  await expect(alex.getByText("Nobody matches.")).toBeVisible();
});
