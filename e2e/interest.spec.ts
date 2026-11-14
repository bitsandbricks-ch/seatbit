import { createEvent, expect, test, userId, type Who } from "./fixtures";

const member = (who: Who) => `a[href$="/members/${userId(who)}"]`;

test.describe("interest check", () => {
  test("members see who is interested, maybe or not, and their own answer joins the list", async ({ as }) => {
    const id = createEvent({
      interestCheck: true,
      interest: [
        { who: "ben", answer: "yes" },
        { who: "chiara", answer: "maybe" },
        { who: "david", answer: "no" },
      ],
    });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);

    const interested = page.getByRole("region", { name: "Interested", exact: true });
    const maybe = page.getByRole("region", { name: "Maybe", exact: true });
    const not = page.getByRole("region", { name: "Not interested", exact: true });
    await expect(interested.locator(member("ben"))).toBeVisible();
    await expect(maybe.locator(member("chiara"))).toBeVisible();
    await expect(not.locator(member("david"))).toBeVisible();
    await expect(page.locator(member("anna"))).toHaveCount(0);

    await page.getByRole("region", { name: "Would you come?" }).getByRole("button", { name: "I'd come" }).click();
    await expect(interested.locator(member("anna"))).toBeVisible();

    // The attendees tab lists the same answers while the interest check runs.
    await page.goto(`/lans/${id}?tab=attendees`);
    await expect(page.getByRole("region", { name: "Interested", exact: true }).locator(member("anna"))).toBeVisible();
    await expect(page.getByRole("region", { name: "Not interested", exact: true }).locator(member("david"))).toBeVisible();
  });
});
