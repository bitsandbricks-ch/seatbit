import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const { lan, foodOrder, foodItem } = schema;
const HOUR = 3_600_000;

/** An event that started an hour ago: food orders are for the LAN itself. */
function runningEvent() {
  const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
  db()
    .update(lan)
    .set({ startsAt: new Date(Date.now() - HOUR), endsAt: new Date(Date.now() + 40 * HOUR) })
    .where(eq(lan.id, id))
    .run();
  return id;
}

// Food run: one starts an order, others add their lines, the runner gets the list and ticks who paid.
test.describe("food orders", () => {
  test("start an order, add to it, tick who paid, close it", async ({ as }) => {
    const id = runningEvent();

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=food`);
    await ben.getByLabel("What").filter({ visible: true }).fill("Pizza tonight");
    await ben.getByLabel("From").filter({ visible: true }).fill("Pizzeria Test");
    await ben.getByRole("button", { name: "Start order" }).click();
    await expect(ben.getByText("Pizza tonight")).toBeVisible();
    const order = db().select().from(foodOrder).where(eq(foodOrder.lanId, id)).get();
    expect(order).toMatchObject({ title: "Pizza tonight", shop: "Pizzeria Test", status: "open", createdBy: userId("ben") });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=food`);
    await anna.getByLabel("How many").filter({ visible: true }).selectOption("2");
    await anna.getByLabel("What").filter({ visible: true }).fill("Margherita");
    await anna.getByLabel("Price each in CHF").filter({ visible: true }).fill("12.50");
    await anna.getByRole("button", { name: "Add", exact: true }).click();
    await expect(anna.getByRole("button", { name: "Remove Margherita" })).toBeVisible();
    expect(db().select().from(foodItem).where(eq(foodItem.orderId, order!.id)).all()).toMatchObject([
      { userId: userId("anna"), item: "Margherita", qty: 2, priceCents: 1250, paid: false },
    ]);

    // Ben runs the order: the merged list, the total, and who still owes.
    await ben.reload();
    await expect(ben.getByRole("listitem").filter({ hasText: /^2x Margherita$/ })).toBeVisible();
    await expect(ben.getByText("Total CHF 25.00")).toBeVisible();
    await ben.getByRole("checkbox", { name: "Paid" }).check();
    await expect(ben.getByText("all paid")).toBeVisible();
    await expect(ben.getByRole("checkbox", { name: "Paid" })).toBeChecked();
    expect(db().select().from(foodItem).where(eq(foodItem.orderId, order!.id)).get()?.paid).toBe(true);

    await ben.getByRole("button", { name: "Close order" }).click();
    await expect(ben.getByRole("button", { name: "Reopen" })).toBeVisible();
    expect(db().select().from(foodOrder).where(eq(foodOrder.id, order!.id)).get()?.status).toBe("closed");

    // Closed: Anna can't add more or take her line back.
    await anna.reload();
    await expect(anna.getByRole("button", { name: "Add", exact: true })).toBeHidden();
    await expect(anna.getByRole("button", { name: "Remove Margherita" })).toBeHidden();
  });

  test("a paid tick that can't be saved goes back", async ({ as }) => {
    const id = runningEvent();
    const order = db()
      .insert(foodOrder)
      .values({ lanId: id, title: "Kebab", createdBy: userId("ben") })
      .returning()
      .get();
    db().insert(foodItem).values({ orderId: order.id, userId: userId("anna"), item: "Dürüm", qty: 1, priceCents: 1100 }).run();
    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=food`);
    const paid = ben.getByRole("checkbox", { name: "Paid" });
    await expect(paid).not.toBeChecked();
    // Someone deletes the order while Ben still has it open.
    db().delete(foodOrder).where(eq(foodOrder.id, order.id)).run();
    await paid.click();
    await expect(ben.getByRole("list", { name: "Errors" }).getByText("This food order is gone.")).toBeVisible();
    await expect(paid).not.toBeChecked();
  });

  test("only who runs the order ticks who paid", async ({ as }) => {
    const id = runningEvent();
    const order = db()
      .insert(foodOrder)
      .values({ lanId: id, title: "Burgers", createdBy: userId("ben") })
      .returning()
      .get();
    db().insert(foodItem).values({ orderId: order.id, userId: userId("anna"), item: "Cheeseburger", qty: 1, priceCents: 900 }).run();
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=food`);
    await expect(anna.getByText("1x Cheeseburger", { exact: true })).toBeVisible();
    await expect(anna.getByRole("checkbox", { name: "Paid" })).toHaveCount(0);
    await expect(anna.getByRole("button", { name: "Close order" })).toHaveCount(0);
  });
});
