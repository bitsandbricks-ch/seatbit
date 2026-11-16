import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID, CLAN_SLUG } from "./env";
import { createEvent, db, expect, signInById, test, userId } from "./fixtures";

const { attendance } = schema;
const answer = (lanId: string, user: string) =>
  db().select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, user))).get();

// Leaving a clan (after a confirm) withdraws the answers on its upcoming events, so the spot goes to
// the waitlist; an answer with a ticket stays for the leads.
test("leaving a clan frees the spots one held, but keeps answers with a ticket", async ({ browser }) => {
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
  const ticketed = createEvent();
  db().insert(attendance).values({ lanId: ticketed, userId: id, status: "going", ticketBought: true }).run();

  const context = await browser.newContext();
  try {
    await signInById(context, id);
    const page = await context.newPage();
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
  } finally {
    await context.close();
  }
});
