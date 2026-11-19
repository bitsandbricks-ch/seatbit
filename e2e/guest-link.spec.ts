import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { attendance, auditLog, clanMember, seat, user } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";
import { CLAN_ID, CLAN_SLUG } from "./env";

/** A fresh guest of the demo clan. */
function createGuest() {
  const id = `e2e-guest-${crypto.randomUUID().slice(0, 8)}`;
  db()
    .insert(user)
    .values({ id, name: "Lena Linked", firstName: "Lena", lastName: "Linked", email: `${id}@guest.example.com`, isGuest: true, guestClanId: CLAN_ID })
    .run();
  db().insert(clanMember).values({ clanId: CLAN_ID, userId: id, role: "member" }).run();
  return id;
}

test.describe("linking a guest to a member", () => {
  test("a clan admin links a guest; the guest's ticket and seat win over the member's unsure", async ({ as }) => {
    const guest = createGuest();
    // David said "unsure" and has no seat; the guest has a ticket and seat A1 on the same event.
    const lan = createEvent({ seats: ["A1", "A2"], attendees: [{ who: "david", status: "maybe" }] });
    db().insert(attendance).values({ lanId: lan, userId: guest, status: "going", ticketBought: true }).run();
    db().update(seat).set({ userId: guest }).where(and(eq(seat.lanId, lan), eq(seat.label, "A1"))).run();

    const page = await as("alex");
    page.on("dialog", (d) => {
      throw new Error(`browser dialog: ${d.message()}`);
    });
    await page.goto(`/clans/${CLAN_SLUG}/members/${guest}`);
    await page.getByRole("searchbox", { name: "Search name or email" }).fill("david");
    await page.getByRole("listitem").filter({ hasText: "both on 1 event" }).getByRole("button", { name: "Link" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Both answered 1 event:")).toBeVisible();
    await expect(dialog.getByText(/answer is further along/)).toBeVisible();
    await dialog.getByRole("button", { name: "Link" }).click();

    await expect(page).toHaveURL(new RegExp(`/members/${userId("david")}$`));
    expect(db().select().from(user).where(eq(user.id, guest)).get()).toBeUndefined();
    const a = db().select().from(attendance).where(and(eq(attendance.lanId, lan), eq(attendance.userId, userId("david")))).get();
    expect(a?.status).toBe("going");
    expect(a?.ticketBought).toBe(true);
    const s = db().select().from(seat).where(and(eq(seat.lanId, lan), eq(seat.userId, userId("david")))).get();
    expect(s?.label).toBe("A1");
    const log = db().select().from(auditLog).where(and(eq(auditLog.action, "guest.merged"), eq(auditLog.targetUserId, userId("david")))).all();
    expect(log.some((l) => (l.data as { guest?: string }).guest === "Lena Linked")).toBe(true);
  });

  test("plain members don't see the link option", async ({ as }) => {
    const guest = createGuest();
    const page = await as("anna");
    await page.goto(`/clans/${CLAN_SLUG}/members/${guest}`);
    await expect(page.getByText("Lena Linked").first()).toBeVisible();
    await expect(page.getByText("Link to a member")).toHaveCount(0);
  });

  test("platform staff link from the admin user page", async ({ as }) => {
    const guest = createGuest();
    const page = await as("alex");
    await page.goto(`/admin/users/${guest}`);
    await page.getByRole("searchbox", { name: "Search name or email" }).fill("ben");
    await page.getByRole("listitem").filter({ hasText: /Ben/ }).first().getByRole("button", { name: "Link" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Link" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/users/${userId("ben")}$`));
    expect(db().select().from(user).where(eq(user.id, guest)).get()).toBeUndefined();
  });
});
