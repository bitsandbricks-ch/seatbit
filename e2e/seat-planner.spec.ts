import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId, type Who } from "./fixtures";

const { attendance, seat, seatVariant } = schema;

const seatOf = (lanId: string, who: Who) =>
  db()
    .select({ label: seat.label })
    .from(seat)
    .where(and(eq(seat.lanId, lanId), eq(seat.userId, userId(who))))
    .get()?.label;

const wish = (lanId: string, who: Who, next: Who) =>
  db()
    .update(attendance)
    .set({ wishRules: [{ kind: "next", userId: userId(next) }] })
    .where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId(who))))
    .run();

test.describe("how hard the seat planner looks", () => {
  test("a lead re-plans with the extended search", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [
        { who: "anna", ticket: true, seat: "A1" },
        { who: "ben", ticket: true, seat: "A2" },
        { who: "chiara", ticket: true, seat: "A4" },
      ],
    });
    wish(id, "anna", "chiara");
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByRole("button", { name: "Extended" }).click();
    await alex.getByRole("button", { name: "Re-plan everyone" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Re-plan everyone" }).click();
    await expect(alex.getByText(/Planned 3 seats from scratch/)).toBeVisible();
    const [a, c] = [seatOf(id, "anna")!, seatOf(id, "chiara")!];
    expect(Math.abs(Number(a.slice(1)) - Number(c.slice(1)))).toBe(1);
  });

  test("the thorough search runs in the background and saves a variant, the live seats stay", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [
        { who: "anna", ticket: true, seat: "A1" },
        { who: "ben", ticket: true, seat: "A2" },
        { who: "chiara", ticket: true, seat: "A4" },
      ],
    });
    wish(id, "anna", "chiara");
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByRole("button", { name: "Thorough" }).click();
    await alex.getByRole("button", { name: "Start thorough search" }).click();
    await expect(alex.getByText(/Searching in the background/)).toBeVisible();
    // Every wish can be met, so it stops right away; the page refreshes by itself.
    const card = alex.locator("#seat-variants");
    await expect(card.getByText("Thorough search 1")).toBeVisible({ timeout: 15_000 });
    const v = db().select().from(seatVariant).where(eq(seatVariant.lanId, id)).get()!;
    const at = Object.fromEntries(Object.entries(v.seats).map(([label, u]) => [u, Number(label.slice(1))]));
    expect(Math.abs(at[userId("anna")] - at[userId("chiara")])).toBe(1);
    expect([seatOf(id, "anna"), seatOf(id, "ben"), seatOf(id, "chiara")]).toEqual(["A1", "A2", "A4"]);
  });
});
