import { and, eq } from "drizzle-orm";
import { attendance, lan, seat } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

const seatOf = (lanId: string, label: string) =>
  db().select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.label, label))).get();

test.describe("seats", () => {
  test("a member sends seat wishes", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [{ who: "anna" }, { who: "ben" }, { who: "chiara" }],
    });
    const page = await as("anna");
    await page.goto(`/lans/${id}?tab=seats`);

    await expect(page.getByRole("heading", { name: "Seat wishes" })).toBeVisible();
    const wishes = page.getByRole("main");
    await wishes.getByRole("listitem").filter({ hasText: "Ben" }).getByRole("button", { name: "Near" }).click();
    await wishes.getByRole("listitem").filter({ hasText: "Chiara" }).getByRole("button", { name: "Not next to" }).click();
    await wishes.getByRole("button", { name: "At the edge" }).click();
    await wishes.getByRole("button", { name: "Save wishes" }).click();
    await expect(page.getByText("Saved. The leads will try to make it work.")).toBeVisible();

    const a = db().select().from(attendance).where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna")))).get();
    expect(a?.wishNear).toEqual([userId("ben")]);
    expect(a?.wishAvoid).toEqual([userId("chiara")]);
    expect(a?.wishPosition).toBe("edge");
  });

  test("self pick: a member with a ticket takes a seat, the lead finalizes, the member sees the final plan", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      seatPicking: true,
      attendees: [
        { who: "anna", ticket: true },
        { who: "ben", ticket: true, seat: "A1" },
      ],
    });

    // Anna takes A3; A1 is Ben's and can't be taken.
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    await anna.getByRole("button", { name: /^Seat A3, free/ }).click();
    await anna.getByRole("button", { name: "Take this seat" }).click();
    await expect.poll(() => seatOf(id, "A3")?.userId).toBe(userId("anna"));
    await expect(anna.getByText("Not final yet").first()).toBeVisible();

    // Alex finalizes the plan.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByRole("button", { name: "Finalize seat plan" }).click();
    await expect(alex.getByText(/^Finalized/).first()).toBeVisible();
    await expect.poll(() => db().select().from(lan).where(eq(lan.id, id)).get()?.seatsPublishedAt).toBeTruthy();

    // Anna sees the final plan with her seat, and can't move any more.
    await anna.reload();
    await expect(anna.getByText("Final", { exact: true }).first()).toBeVisible();
    await expect(anna.getByRole("button", { name: /^Seat A3, / })).toBeVisible();
    await anna.getByRole("button", { name: /^Seat A4, free/ }).click();
    await expect(anna.getByRole("button", { name: "Move here" })).toHaveCount(0);
  });

  test("a member without a ticket can't pick a seat yet", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], seatPicking: true, attendees: [{ who: "anna" }] });
    const page = await as("anna");
    await page.goto(`/lans/${id}?tab=seats`);
    await page.getByRole("button", { name: /^Seat A1, free/ }).click();
    await expect(page.getByRole("button", { name: "Take this seat" })).toHaveCount(0);
  });
});
