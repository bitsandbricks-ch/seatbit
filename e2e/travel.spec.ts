import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const { travelPost, travelSpot } = schema;

// Carpool: offer a ride, others join and leave it, a driver takes someone along who asked.
test.describe("travel", () => {
  test("a member offers a ride, another joins and leaves it", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=travel`);
    await ben.getByRole("button", { name: "Offer a ride" }).click();
    await ben.getByLabel("Leaving from").fill("Zug");
    await ben.getByLabel("Free seats").fill("2");
    await ben.getByLabel("When").fill("Fri 16:00");
    await ben.getByRole("button", { name: "Post offer" }).click();
    await expect(ben.getByText("2 of 2 seats free")).toBeVisible();
    const offer = db().select().from(travelPost).where(eq(travelPost.lanId, id)).get();
    expect(offer).toMatchObject({ userId: userId("ben"), kind: "ride", mode: "offer", places: 2, town: "Zug" });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=travel`);
    await expect(anna.getByText("Fri 16:00")).toBeVisible();
    await anna.getByRole("button", { name: "Join ride" }).click();
    await expect(anna.getByText("1 of 2 seats free")).toBeVisible();
    await expect(anna.getByRole("button", { name: "Join ride" })).toBeHidden();
    expect(db().select().from(travelSpot).where(eq(travelSpot.postId, offer!.id)).all().map((s) => s.userId)).toEqual([userId("anna")]);

    await anna.getByRole("button", { name: "Leave", exact: true }).click();
    await expect(anna.getByText("2 of 2 seats free")).toBeVisible();
    await expect(anna.getByRole("button", { name: "Join ride" })).toBeVisible();
    expect(db().select().from(travelSpot).where(eq(travelSpot.postId, offer!.id)).all()).toEqual([]);
  });

  test("a driver takes along someone who asked for a ride", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }] });
    const offer = db()
      .insert(travelPost)
      .values({ lanId: id, userId: userId("ben"), kind: "ride", mode: "offer", places: 3, town: "Zug" })
      .returning()
      .get();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=travel`);
    await anna.getByRole("button", { name: "Need a ride" }).click();
    await anna.getByLabel("From").fill("Baar");
    await anna.getByRole("button", { name: "Post request" }).click();
    await expect(anna.getByText("needs a ride")).toBeVisible();

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=travel`);
    await ben.getByRole("button", { name: "Take along" }).click();
    await expect(ben.getByText("2 of 3 seats free")).toBeVisible();
    const spot = db()
      .select()
      .from(travelSpot)
      .where(and(eq(travelSpot.postId, offer.id), eq(travelSpot.userId, userId("anna"))))
      .get();
    expect(spot).toBeTruthy();
  });

  test("someone not coming can't offer or join rides", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna", status: "declined" }, { who: "ben" }] });
    db().insert(travelPost).values({ lanId: id, userId: userId("ben"), kind: "ride", mode: "offer", places: 3, town: "Zug" }).run();
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=travel`);
    await expect(anna.getByText("Say you're coming (or unsure) on the Overview tab")).toBeVisible();
    await expect(anna.getByRole("button", { name: "Join ride" })).toBeHidden();
    await expect(anna.getByRole("button", { name: "Offer a ride" })).toBeHidden();
  });
});
