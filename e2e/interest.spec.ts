import { and, eq } from "drizzle-orm";
import { attendance, lan } from "../src/db/schema";
import { createEvent, db, expect, test, userId, type Who } from "./fixtures";

const member = (who: Who) => `a[href$="/members/${userId(who)}"]`;

test.describe("interest check", () => {
  test("members only answer and see who answered; seats, travel and the rest stay hidden", async ({ as }) => {
    const id = createEvent({
      interestCheck: true,
      attendees: [
        { who: "ben", status: "going" },
        { who: "chiara", status: "maybe" },
        { who: "david", status: "declined" },
      ],
    });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);

    const coming = page.getByRole("region", { name: "Coming", exact: true });
    const unsure = page.getByRole("region", { name: "Unsure", exact: true });
    const not = page.getByRole("region", { name: "Not coming", exact: true });
    const none = page.getByRole("region", { name: "No answer yet", exact: true });
    await expect(coming.locator(member("ben"))).toBeVisible();
    await expect(unsure.locator(member("chiara"))).toBeVisible();
    await expect(not.locator(member("david"))).toBeVisible();
    await expect(none.locator(member("anna"))).toBeVisible();

    // No tabs, no checklist: just the answer and the list.
    await expect(page.getByRole("link", { name: /^(Seats|Trip)/ })).toHaveCount(0);
    await expect(page.getByText("Seats, travel, packing, games and costs open once the Leads open sign-up.")).toBeVisible();
    // Members can't remind others.
    await expect(none.getByRole("button", { name: "Remind" })).toHaveCount(0);

    // The same three answers as sign-up later.
    await page.getByRole("region", { name: "Would you come?" }).getByRole("button", { name: "I'm coming" }).click();
    await expect(coming.locator(member("anna"))).toBeVisible();
    await expect(none.locator(member("anna"))).toHaveCount(0);
  });

  test("the interest check ignores the limit: nobody lands on the waitlist yet", async ({ as }) => {
    const id = createEvent({ interestCheck: true, capacity: 1, attendees: [{ who: "ben", status: "going" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    await page.getByRole("region", { name: "Would you come?" }).getByRole("button", { name: "I'm coming" }).click();
    const row = () =>
      db().select().from(attendance).where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna")))).get()?.status;
    await expect.poll(row).toBe("going");
  });

  test("leads open sign-up after a confirm; answers carry over and the tabs appear", async ({ as }) => {
    const id = createEvent({ interestCheck: true, attendees: [{ who: "anna", status: "going" }] });
    const lead = await as("alex");
    lead.on("dialog", (d) => {
      throw new Error(`browser dialog: ${d.message()}`);
    });
    await lead.goto(`/lans/${id}`);
    // Leads can remind everyone without an answer from the list.
    await expect(lead.getByRole("region", { name: "No answer yet", exact: true }).getByRole("button", { name: "Remind" })).toBeVisible();

    await lead.getByRole("button", { name: "Open sign-up", exact: true }).click();
    const dialog = lead.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Open sign-up now?" })).toBeVisible();
    await dialog.getByRole("button", { name: "Yes, open sign-up" }).click();
    await expect.poll(() => db().select().from(lan).where(eq(lan.id, id)).get()?.interestCheck).toBe(false);

    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    await expect(page.getByRole("link", { name: /^Trip/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Your attendance" }).getByRole("button", { name: "I'm coming" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("a scheduled opening shows to members, and leads can take it back", async ({ as }) => {
    const id = createEvent({ interestCheck: true });
    db().update(lan).set({ signupOpensAt: new Date(Date.now() + 3 * 86400_000) }).where(eq(lan.id, id)).run();
    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    await expect(page.getByText(/open with sign-up on/)).toBeVisible();

    const lead = await as("alex");
    await lead.goto(`/lans/${id}`);
    await lead.getByRole("button", { name: "Don't schedule" }).click();
    await expect.poll(() => db().select().from(lan).where(eq(lan.id, id)).get()?.signupOpensAt ?? null).toBeNull();
  });
});
