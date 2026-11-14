import { and, eq } from "drizzle-orm";
import { attendance, lan, seat } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

const seatOf = (lanId: string, label: string) =>
  db().select().from(seat).where(and(eq(seat.lanId, lanId), eq(seat.label, label))).get();

test.describe("seats", () => {
  test("a member ranks seat wishes: add, reorder with arrows and drag, remove", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [{ who: "anna" }, { who: "ben" }, { who: "chiara" }],
    });
    const rulesOf = () =>
      db().select().from(attendance).where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna")))).get()?.wishRules;
    const page = await as("anna");
    await page.goto(`/lans/${id}?tab=seats`);
    await expect(page.getByRole("heading", { name: "Seat wishes" })).toBeVisible();
    const main = page.getByRole("main");

    // Add three wishes; each one saves right away.
    await main.getByRole("button", { name: "+ Near someone" }).click();
    await main.getByLabel("Who do you want to sit near?").selectOption(userId("ben"));
    await main.getByLabel("How close?").selectOption({ label: "Right next to" });
    await main.getByRole("button", { name: "Add", exact: true }).click();
    await expect.poll(rulesOf).toEqual([{ kind: "near", userId: userId("ben"), within: 1 }]);
    // The range can be changed on the wish itself.
    await main.getByLabel(/^How close: Right next to Ben/).selectOption({ label: "Same row" });
    await expect.poll(rulesOf).toEqual([{ kind: "near", userId: userId("ben"), within: "row" }]);
    await main.getByRole("button", { name: "+ Away from someone" }).click();
    await main.getByLabel("Who should not sit close to you?").selectOption(userId("chiara"));
    await main.getByRole("button", { name: "Add", exact: true }).click();
    await main.getByRole("button", { name: "+ At the edge" }).click();
    await expect.poll(() => rulesOf()?.length).toBe(3);

    // The edge matters most: move it to the top with the arrows.
    await main.getByRole("button", { name: "Move up: At the edge of a row" }).click();
    await expect.poll(() => rulesOf()?.map((r) => r.kind)).toEqual(["near", "edge", "avoid"]);
    await main.getByRole("button", { name: "Move up: At the edge of a row" }).click();
    await expect.poll(() => rulesOf()?.map((r) => r.kind)).toEqual(["edge", "near", "avoid"]);
    await expect(page.getByText("Saved. The leads will try to make it work.").first()).toBeVisible();

    // Drag "Not next to" from the bottom to the top by its handle.
    const handle = main.getByRole("button", { name: /^Drag to move: Not right next to/ });
    const top = main.getByRole("listitem").filter({ hasText: "At the edge of a row" });
    const from = (await handle.boundingBox())!;
    const to = (await top.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => rulesOf()?.map((r) => r.kind)).toEqual(["avoid", "edge", "near"]);

    // Remove one.
    await main.getByRole("button", { name: "Remove: At the edge of a row" }).click();
    await expect.poll(() => rulesOf()?.map((r) => r.kind)).toEqual(["avoid", "near"]);
  });

  test("leads see each member's ranked wishes and how well the plan meets them", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4"],
      attendees: [
        { who: "anna", seat: "A1" },
        { who: "ben", seat: "A2" },
        { who: "chiara", seat: "A4" },
      ],
    });
    // Anna's top wish (near Ben) is met, her second (seat A4) is not: 1 / 1.5 = 67%.
    db()
      .update(attendance)
      .set({ wishRules: [{ kind: "near", userId: userId("ben") }, { kind: "seat", seat: "A4" }] })
      .where(and(eq(attendance.lanId, id), eq(attendance.userId, userId("anna"))))
      .run();
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    const card = alex.locator("#wishes");
    await expect(card.getByText("67% met")).toBeVisible();
    // Anna needs a look: her row shows the missed wish; tapping it opens the full ranked list.
    await expect(card.locator("summary").getByText("seat A4")).toBeVisible();
    await card.locator("summary", { hasText: "Anna" }).click();
    const wishes = card.getByRole("list", { name: /^Wishes of Anna/ });
    await expect(wishes.getByRole("listitem").first()).toContainText("near Ben");
    await expect(wishes.getByRole("listitem").nth(1)).toContainText("seat A4");
  });

  test("automatic re-planning: a wish change re-plans the seats", async ({ as }) => {
    const id = createEvent({
      seats: ["A1", "A2", "A3", "A4", "A5", "A6"],
      attendees: [
        { who: "anna", seat: "A1" },
        { who: "ben", seat: "A6" },
      ],
    });
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=seats`);
    await alex.getByLabel(/Re-plan automatically when wishes change/).check();
    await expect.poll(() => db().select().from(lan).where(eq(lan.id, id)).get()?.seatAutoPlan).toBe(true);

    // Anna wants to sit right next to Ben: saving the wish moves them together.
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    await anna.getByRole("button", { name: "+ Near someone" }).click();
    await anna.getByLabel("Who do you want to sit near?").selectOption(userId("ben"));
    await anna.getByLabel("How close?").selectOption({ label: "Right next to" });
    await anna.getByRole("button", { name: "Add", exact: true }).click();
    const colOf = (who: "anna" | "ben") =>
      Number(db().select().from(seat).where(and(eq(seat.lanId, id), eq(seat.userId, userId(who)))).get()?.label.slice(1));
    await expect.poll(() => Math.abs(colOf("anna") - colOf("ben"))).toBe(1);

    // The lead's open page picks the change up by itself, and the plan history says who moved.
    const history = alex.locator("#plan-history");
    await expect(history.getByText(/so the seats were re-planned/)).toBeVisible({ timeout: 20_000 });
    await expect(history.getByText(/moved:.*Anna.*→/).first()).toBeVisible();
    // Anna's wish is met now, so she's under "Everyone", not "Needs a look".
    await alex.locator("#wishes").getByRole("link", { name: /Everyone/ }).click();
    await alex.locator("#wishes summary", { hasText: "Anna" }).click();
    await expect(alex.locator("#wishes").getByText("right next to Ben")).toBeVisible();
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
