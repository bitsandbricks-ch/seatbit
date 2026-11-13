import { and, eq } from "drizzle-orm";
import { attendance } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

const mine = (lanId: string) =>
  db().select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId("anna")))).get();

test.describe("answering an event", () => {
  test("a member answers coming, unsure and not coming, and the answer is saved", async ({ as }) => {
    const id = createEvent();
    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    const answer = page.getByRole("region", { name: "Your attendance" });

    for (const [button, status] of [
      ["I'm coming", "going"],
      ["Unsure", "maybe"],
      ["Not coming", "declined"],
    ] as const) {
      await answer.getByRole("button", { name: button }).click();
      await expect(answer.getByRole("button", { name: button })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => mine(id)?.status).toBe(status);
    }

    // Still there after a reload.
    await page.reload();
    await expect(page.getByRole("region", { name: "Your attendance" }).getByRole("button", { name: "Not coming" })).toHaveAttribute("aria-pressed", "true");
  });

  test("ticking the ticket locks the answer", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna", status: "going" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);

    await page.getByRole("checkbox", { name: /I have my ticket/ }).check();
    await expect.poll(() => mine(id)?.ticketBought).toBe(true);

    // The answer buttons are gone; the answer shrinks to a badge that explains why.
    await page.reload();
    await expect(page.getByRole("button", { name: "Not coming" })).toHaveCount(0);
    await expect(page.getByText("You have a ticket, so your answer is locked.", { exact: false })).toBeAttached();
  });

  test("a full event puts the next person on the waitlist", async ({ as }) => {
    const id = createEvent({ capacity: 1, attendees: [{ who: "ben", status: "going" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}`);
    await page.getByRole("button", { name: "I'm coming" }).click();
    await expect.poll(() => mine(id)?.status).toBe("waitlist");
    await expect(page.getByText(/waitlist/i).first()).toBeVisible();
  });

  test("members can't open the lead view of an event", async ({ as }) => {
    const id = createEvent();
    const page = await as("anna");
    await page.goto(`/lans/${id}/manage`);
    await expect(page).toHaveURL(new RegExp(`/lans/${id}$`));
  });
});
