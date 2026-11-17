import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID, CLAN_SLUG } from "./env";
import { createEvent, db, expect, signInById, test, userId } from "./fixtures";

const { attendance } = schema;
const answer = (lanId: string, user: string) =>
  db().select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, user))).get();

// Leaving a clan (after a confirm) withdraws the answers on its upcoming events, so the spot goes to
// the waitlist, and ends their lead roles; an answer with a ticket stays for the leads.
test("leaving a clan frees the spots one held and ends lead roles, but keeps answers with a ticket", async ({ browser }) => {
  const id = `e2e-quitter-${Date.now()}`;
  const now = new Date();
  db()
    .insert(schema.user)
    .values({ id, name: "Lou Fort", firstName: "Lou", lastName: "Fort", email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now })
    .run();
  db().insert(schema.clanMember).values({ clanId: CLAN_ID, userId: id, role: "member" }).run();
  const full = createEvent({ capacity: 1 });
  db().insert(attendance).values({ lanId: full, userId: id, status: "going" }).run();
  db().insert(attendance).values({ lanId: full, userId: userId("ben"), status: "waitlist", waitlistedAt: now }).run();
  // A lead of one of the clan's events: that role goes with the membership.
  db().insert(schema.lanOrga).values({ lanId: full, userId: id }).run();
  const ticketed = createEvent();
  db().insert(attendance).values({ lanId: ticketed, userId: id, status: "going", ticketBought: true }).run();

  const context = await browser.newContext();
  try {
    await signInById(context, id);
    const page = await context.newPage();
    await page.goto(`/lans/${full}/manage`);
    await expect(page).toHaveURL(/\/manage/);
    await page.goto(`/clans/${CLAN_SLUG}`);
    await page.getByRole("button", { name: "Leave clan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("your answers on its upcoming events are withdrawn");
    await dialog.getByRole("button", { name: "Leave clan" }).click();
    await page.waitForURL(/\/clans$/);

    expect(db().select().from(schema.clanMember).where(eq(schema.clanMember.userId, id)).all()).toEqual([]);
    expect(answer(full, id)).toBeUndefined();
    expect(answer(full, userId("ben"))?.status).toBe("going");
    expect(answer(ticketed, id)?.status).toBe("going");
    expect(db().select().from(schema.lanOrga).where(eq(schema.lanOrga.userId, id)).all()).toEqual([]);

    // Even a lead role left behind (older data) gives a non-member no way in.
    db().insert(schema.lanOrga).values({ lanId: full, userId: id }).run();
    await page.goto(`/lans/${full}/manage`);
    await expect(page).not.toHaveURL(/\/manage/);
  } finally {
    await context.close();
  }
});

// Removing a member also clears what names them on the clan's upcoming events (others' seat wishes,
// rides, their seat); an answer with a ticket stays and is marked for the leads.
test("removing a member clears their seat, rides and the wishes naming them", async ({ as }) => {
  const id = `e2e-removed-${Date.now()}`;
  const now = new Date();
  db()
    .insert(schema.user)
    .values({ id, name: "Rex Stone", firstName: "Rex", lastName: "Stone", email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now })
    .run();
  db().insert(schema.clanMember).values({ clanId: CLAN_ID, userId: id, role: "member" }).run();
  const open = createEvent({ capacity: 2, seats: ["A1", "A2"], attendees: [{ who: "anna", seat: "A2" }] });
  db().insert(attendance).values({ lanId: open, userId: id, status: "going" }).run();
  db().insert(attendance).values({ lanId: open, userId: userId("ben"), status: "waitlist", waitlistedAt: now }).run();
  db().update(schema.seat).set({ userId: id }).where(and(eq(schema.seat.lanId, open), eq(schema.seat.label, "A1"))).run();
  db()
    .update(attendance)
    .set({ wishRules: [{ kind: "next", userId: id }, { kind: "edge" }] })
    .where(and(eq(attendance.lanId, open), eq(attendance.userId, userId("anna"))))
    .run();
  db().insert(schema.travelPost).values({ lanId: open, userId: id, kind: "ride", mode: "offer", town: "Bern" }).run();
  const annaRide = db()
    .insert(schema.travelPost)
    .values({ lanId: open, userId: userId("anna"), kind: "ride", mode: "offer", town: "Zug", places: 3 })
    .returning()
    .get();
  db().insert(schema.travelSpot).values({ postId: annaRide.id, userId: id }).run();
  const ticketed = createEvent({ attendees: [{ who: "anna" }] });
  db().insert(attendance).values({ lanId: ticketed, userId: id, status: "going", ticketBought: true }).run();
  db()
    .update(attendance)
    .set({ wishRules: [{ kind: "near", userId: id }] })
    .where(and(eq(attendance.lanId, ticketed), eq(attendance.userId, userId("anna"))))
    .run();

  const page = await as("alex");
  await page.goto(`/clans/${CLAN_SLUG}/members/${id}`);
  await page.getByRole("button", { name: "Remove from clan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("seat wishes, rides and teams that name them are cleared");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await page.waitForURL(/tab=members/);

  expect(answer(open, id)).toBeUndefined();
  expect(answer(open, userId("ben"))?.status).toBe("going");
  expect(answer(open, userId("anna"))?.wishRules).toEqual([{ kind: "edge" }]);
  expect(db().select().from(schema.seat).where(eq(schema.seat.userId, id)).all()).toEqual([]);
  expect(db().select().from(schema.travelPost).where(eq(schema.travelPost.userId, id)).all()).toEqual([]);
  expect(db().select().from(schema.travelSpot).where(eq(schema.travelSpot.userId, id)).all()).toEqual([]);
  // With a ticket they may still go: the answer and the wishes about them stay, and the leads see why.
  expect(answer(ticketed, id)?.status).toBe("going");
  expect(answer(ticketed, userId("anna"))?.wishRules).toEqual([{ kind: "near", userId: id }]);
  await page.goto(`/lans/${ticketed}/manage?tab=attendees`);
  await expect(page.getByTitle("No longer in the clan").first()).toBeAttached();
});
