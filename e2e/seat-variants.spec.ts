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

/** Swaps two people's seats behind the page's back, like a lead moving them on the map. */
function swap(lanId: string, a: Who, b: Who) {
  const [sa, sb] = [seatOf(lanId, a)!, seatOf(lanId, b)!];
  db().transaction((tx) => {
    tx.update(seat).set({ userId: null }).where(and(eq(seat.lanId, lanId), eq(seat.label, sa))).run();
    tx.update(seat).set({ userId: userId(a) }).where(and(eq(seat.lanId, lanId), eq(seat.label, sb))).run();
    tx.update(seat).set({ userId: userId(b) }).where(and(eq(seat.lanId, lanId), eq(seat.label, sa))).run();
  });
}

test.describe("seat plan variants", () => {
  test("a lead saves the plan, changes it, previews the saved one and applies it again", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3"],
      attendees: [
        { who: "anna", ticket: true, seat: "A1" },
        { who: "ben", ticket: true, seat: "A2" },
        { who: "chiara", ticket: true, seat: "A3" },
      ],
    });
    // Anna wants to sit right next to Chiara: only the swapped plan meets it.
    db()
      .update(attendance)
      .set({ wishRules: [{ kind: "next", userId: userId("chiara") }] })
      .where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna"))))
      .run();

    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    const card = alex.locator("#seat-variants");
    await card.getByRole("textbox", { name: "Variant name" }).fill("Original");
    await card.getByRole("button", { name: "Save current plan" }).click();
    await expect(card.getByText("Same as live")).toBeVisible();
    expect(db().select().from(seatVariant).where(eq(seatVariant.lanId, id)).get()?.seats).toEqual({
      A1: userId("anna"),
      A2: userId("ben"),
      A3: userId("chiara"),
    });

    // The leads move people around: the saved variant now differs.
    swap(id, "anna", "ben");
    await alex.reload();
    await expect(card.getByText("2 people move")).toBeVisible();

    // The preview checks the variant against today's wishes: Anna isn't next to Chiara there.
    await card.getByRole("link", { name: "Preview" }).click();
    await expect(alex.getByText("Previewing variant Original")).toBeVisible();
    await expect(alex.getByText(/worse for/)).toBeVisible();
    // Previewing changes nothing.
    expect(seatOf(id, "anna")).toBe("A2");

    await alex.getByRole("button", { name: "Apply", exact: true }).first().click();
    await alex.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();
    await expect(alex.getByText("Applied “Original”: 2 people moved.")).toBeVisible();
    expect([seatOf(id, "anna"), seatOf(id, "ben"), seatOf(id, "chiara")]).toEqual(["A1", "A2", "A3"]);
    await expect(alex.getByText("Previewing variant Original")).toBeHidden();
  });

  test("plan from wishes makes a variant without moving anyone", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3"],
      attendees: [
        { who: "anna", ticket: true, seat: "A1" },
        { who: "ben", ticket: true, seat: "A2" },
        { who: "chiara", ticket: true, seat: "A3" },
      ],
    });
    db()
      .update(attendance)
      .set({ wishRules: [{ kind: "next", userId: userId("chiara") }] })
      .where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna"))))
      .run();

    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    const card = alex.locator("#seat-variants");
    await card.getByRole("button", { name: "Plan from wishes" }).click();
    await expect(card.getByText("Variant 1")).toBeVisible();
    const v = db().select().from(seatVariant).where(eq(seatVariant.lanId, id)).get()!;
    const at = (who: Who) => Number(Object.keys(v.seats).find((l) => v.seats[l] === userId(who))!.slice(1));
    expect(Math.abs(at("anna") - at("chiara"))).toBe(1);
    // The live plan stays as it was.
    expect([seatOf(id, "anna"), seatOf(id, "ben"), seatOf(id, "chiara")]).toEqual(["A1", "A2", "A3"]);

    // Rename and delete.
    await card.getByRole("button", { name: "Rename" }).click();
    await card.getByRole("textbox", { name: "Variant name" }).last().fill("Wishes first");
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByText("Wishes first")).toBeVisible();
    await card.getByRole("button", { name: "Delete" }).click();
    await alex.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(card.getByText("No variants yet.")).toBeVisible();
    expect(db().select().from(seatVariant).where(eq(seatVariant.lanId, id)).all()).toHaveLength(0);
  });

  test("members don't see variants", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], attendees: [{ who: "anna", ticket: true, seat: "A1" }] });
    db().insert(seatVariant).values({ lanId: id, name: "Secret plan", seats: { A2: userId("anna") } }).run();
    const anna = await as("anna");
    await anna.goto(`/lans/${id}/manage?tab=seats&variant=x`);
    await expect(anna).toHaveURL(new RegExp(`/lans/${id}(\\?|$)`));
    await anna.goto(`/lans/${id}?tab=seats`);
    await expect(anna.getByText("Secret plan")).toHaveCount(0);
  });
});
