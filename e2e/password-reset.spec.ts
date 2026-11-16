import { and, eq, like } from "drizzle-orm";
import { schema } from "../src/db";
import { db, expect, test, userId } from "./fixtures";

const { account, verification } = schema;
const NEW_PASSWORD = "e2e-new-password";

// Forgot password, end to end: request a link, set a new password, sign in with it; the link works once.
test.describe("password reset", () => {
  let oldHash: string | null = null;
  test.beforeEach(() => {
    oldHash = credential()?.password ?? null;
  });
  test.afterEach(() => {
    // Other specs sign in as Anna with the demo password.
    db().update(account).set({ password: oldHash }).where(and(eq(account.userId, userId("anna")), eq(account.providerId, "credential"))).run();
    db().delete(verification).where(like(verification.identifier, "reset-password:%")).run();
  });

  test("a reset link sets a new password once", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("anna@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If that address has an account, a reset link is on its way.")).toBeVisible();

    // The link from the mail, as better-auth builds it.
    await expect.poll(() => resetToken()).toBeTruthy();
    const row = resetToken()!;
    await page.goto(`/api/auth/reset-password/${row}?callbackURL=${encodeURIComponent("/reset-password")}`);
    await expect(page).toHaveURL(/\/reset-password\?token=/);
    const link = page.url();

    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Set password" }).click();
    await expect(page).toHaveURL(/\/login\?reset=1/);
    await expect(page.getByRole("status")).toHaveText("Your password was changed. Sign in with the new one.");

    await page.locator('input[name="email"]').fill("anna@example.com");
    await page.locator('input[name="password"]').fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/login/);

    // The same link again: refused with a clear, translated message.
    const other = await page.context().browser()!.newPage();
    await other.goto(link);
    await other.getByLabel("New password").fill("e2e-another-password");
    await other.getByRole("button", { name: "Set password" }).click();
    const refused = other.getByRole("alert").filter({ hasText: /\S/ });
    await expect(refused).toContainText("This reset link is invalid or expired.");
    await expect(refused.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "/forgot-password");
    await other.close();
  });

  test("an unknown address gets the same answer", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody-e2e@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("If that address has an account, a reset link is on its way.")).toBeVisible();
    expect(resetToken()).toBeUndefined();
  });
});

function credential() {
  return db().select().from(account).where(and(eq(account.userId, userId("anna")), eq(account.providerId, "credential"))).get();
}

function resetToken() {
  const row = db().select().from(verification).where(like(verification.identifier, "reset-password:%")).get();
  return row?.identifier.slice("reset-password:".length);
}
