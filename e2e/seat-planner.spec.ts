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

  test("the exact search runs in the background and saves a proven best variant, the live seats stay", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [
        { who: "anna", ticket: true, seat: "A1" },
        { who: "ben", ticket: true, seat: "A2" },
        { who: "chiara", ticket: true, seat: "A4" },
      ],
    });
    // Wishes that clash (Ben wants to sit next to Chiara, who doesn't want him there), so the
    // solver has to prove there's no plan that meets all of them.
    wish(id, "anna", "chiara");
    wish(id, "ben", "chiara");
    db()
      .update(attendance)
      .set({ wishRules: [{ kind: "avoid", userId: userId("ben") }] })
      .where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("chiara"))))
      .run();
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByRole("button", { name: "Exact", exact: true }).click();
    await alex.getByRole("button", { name: "Start exact search" }).click();
    await expect(alex.getByText(/Searching in the background/)).toBeVisible();
    // Small event: proven within moments; the page refreshes by itself.
    const card = alex.locator("#seat-variants");
    await expect(card.getByText("Exact search 1")).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText("Proven best")).toBeVisible();
    const v = db().select().from(seatVariant).where(eq(seatVariant.lanId, id)).get()!;
    expect(v.proven).toBe(true);
    const at = Object.fromEntries(Object.entries(v.seats).map(([label, u]) => [u, Number(label.slice(1))]));
    expect(Math.abs(at[userId("anna")] - at[userId("chiara")])).toBe(1);
    expect([seatOf(id, "anna"), seatOf(id, "ben"), seatOf(id, "chiara")]).toEqual(["A1", "A2", "A4"]);
  });
});
