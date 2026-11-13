import { expect, test } from "@playwright/test";
import { DISCORD_CLIENT_ID } from "./env";

test.describe("signing in", () => {
  test("a signed-out visitor is sent to the login page", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("Continue with Discord starts the OAuth flow with this app", async ({ page }) => {
    // Stop at Discord's door: check where the browser is sent, without leaving the test server.
    let authorize: URL | undefined;
    await page.route(/discord\.com/, (route) => {
      authorize = new URL(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Discord</p>" });
    });
    await page.goto("/login");
    await page.getByRole("button", { name: "Continue with Discord" }).click();
    await expect.poll(() => authorize?.pathname).toContain("/oauth2/authorize");
    expect(authorize!.searchParams.get("client_id")).toBe(DISCORD_CLIENT_ID);
    expect(authorize!.searchParams.get("redirect_uri")).toMatch(/\/api\/auth\/callback\/discord$/);
    expect(authorize!.searchParams.get("scope")).toContain("identify");
  });

  test("email login: wrong password fails, the right one signs in, sign out ends the session", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill("anna@example.com");
    await page.locator('input[name="password"]').fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/invalid/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.locator('input[name="password"]').fill("seatbit-demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    // Anna's clan events show on the home page.
    await expect(page.getByText(/Lakeside LAN/).first()).toBeVisible();

    await page.goto("/profile");
    await expect(page).toHaveURL(/\/profile/);
    await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  });
});
