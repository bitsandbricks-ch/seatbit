import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId, type Who } from "./fixtures";

const { lan, seat, seatSwap } = schema;

/** An event whose seat plan is out: Anna at A1, Ben at A2, Chiara at A3. */
function publishedPlan() {
  const id = createEvent({
    seats: ["A1", "A2", "A3"],
    attendees: [
      { who: "anna", ticket: true, seat: "A1" },
      { who: "ben", ticket: true, seat: "A2" },
      { who: "chiara", ticket: true, seat: "A3" },
    ],
  });
  db().update(lan).set({ seatsPublishedAt: new Date() }).where(eq(lan.id, id)).run();
  return id;
}

const seatOf = (lanId: string, who: Who) =>
  db()
    .select({ label: seat.label })
    .from(seat)
    .where(and(eq(seat.lanId, lanId), eq(seat.userId, userId(who))))
    .get()?.label;

// Seat swaps once the plan is out: a member asks, the other agrees, a lead approves.
test.describe("seat swaps", () => {
  test("a member asks, the other agrees, a lead approves and the seats change", async ({ as }) => {
    const id = publishedPlan();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    await anna.getByRole("combobox", { name: "Swap with" }).selectOption(userId("ben"));
    await anna.getByRole("textbox", { name: "Why? (optional)" }).fill("Next to Chiara");
    await anna.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(anna.getByText("waiting for them")).toBeVisible();

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=seats`);
    await expect(ben.getByText("Next to Chiara")).toBeVisible();
    await ben.getByRole("button", { name: "Swap", exact: true }).click();
    await expect(ben.getByText("You agreed. Waiting for an organizer to approve.")).toBeVisible();
    // Nothing moves until a lead approves.
    expect([seatOf(id, "anna"), seatOf(id, "ben")]).toEqual(["A1", "A2"]);

    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(alex.getByRole("button", { name: "Approve", exact: true })).toBeHidden();
    expect([seatOf(id, "anna"), seatOf(id, "ben"), seatOf(id, "chiara")]).toEqual(["A2", "A1", "A3"]);
    expect(db().select().from(seatSwap).where(eq(seatSwap.lanId, id)).get()?.status).toBe("approved");

    await anna.reload();
    await expect(anna.getByText(/You sit at\s*A2/)).toBeVisible();
  });

  test("declining ends the request, and the asker can ask someone else", async ({ as }) => {
    const id = publishedPlan();
    db().insert(seatSwap).values({ lanId: id, fromUserId: userId("anna"), toUserId: userId("ben") }).run();

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=seats`);
    await ben.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(ben.getByRole("button", { name: "Decline", exact: true })).toBeHidden();
    expect(db().select().from(seatSwap).where(eq(seatSwap.lanId, id)).get()?.status).toBe("declined");

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    await expect(anna.getByRole("combobox", { name: "Swap with" })).toBeVisible();
    expect([seatOf(id, "anna"), seatOf(id, "ben")]).toEqual(["A1", "A2"]);
  });

  test("no swaps before the plan is out", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], attendees: [{ who: "anna", ticket: true, seat: "A1" }, { who: "ben", ticket: true, seat: "A2" }] });
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    await expect(anna.getByText("Our seats").first()).toBeVisible();
    await expect(anna.getByRole("combobox", { name: "Swap with" })).toHaveCount(0);
  });
});
