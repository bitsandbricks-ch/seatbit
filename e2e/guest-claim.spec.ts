import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { clan, takenGuest, user } from "../src/db/schema";
import { db, expect, test, userId } from "./fixtures";
import { CLAN_ID } from "./env";

/** A fresh guest of the demo clan with its own claim link. */
function createGuest() {
  const id = `e2e-guest-${crypto.randomUUID().slice(0, 8)}`;
  const claimCode = crypto.randomBytes(12).toString("base64url");
  db()
    .insert(user)
    .values({ id, name: "Gus Guest", firstName: "Gus", lastName: "Guest", email: `${id}@guest.example.com`, isGuest: true, guestClanId: CLAN_ID, claimCode })
    .run();
  return { id, claimCode };
}
const guestExists = (id: string) => !!db().select().from(user).where(eq(user.id, id)).get();

test.describe("guest claim links", () => {
  test("opening the link takes nothing over; the button does, and the link then says done", async ({ as }) => {
    const g = createGuest();
    const page = await as("ben");
    await page.goto(`/claim/${g.claimCode}`);
    await expect(page.getByRole("button", { name: "That's me, take it over" })).toBeVisible();
    // A link preview or a first look must not use the link up.
    await page.reload();
    expect(guestExists(g.id)).toBe(true);

    await page.getByRole("button", { name: "That's me, take it over" }).click();
    await expect.poll(() => guestExists(g.id)).toBe(false);

    await page.goto(`/claim/${g.claimCode}`);
    await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await expect(page.getByText("Link no longer works")).toHaveCount(0);
  });

  test("a guest taken over at sign-in shows done to that account and gone to others", async ({ as }) => {
    const g = createGuest();
    // What the sign-in auto-claim (verified email, linked Discord) leaves behind.
    db().transaction((tx) => {
      tx.insert(takenGuest).values({ guestId: g.id, claimCode: g.claimCode, userId: userId("chiara"), guestName: "Gus Guest", clanId: CLAN_ID }).run();
      tx.delete(user).where(eq(user.id, g.id)).run();
    });

    const chiara = await as("chiara");
    await chiara.goto(`/claim/${g.claimCode}`);
    await expect(chiara.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await expect(chiara.getByText("Gus Guest")).toBeVisible();

    const david = await as("david");
    await david.goto(`/claim/${g.claimCode}`);
    await expect(david.getByRole("heading", { name: "Link no longer works" })).toBeVisible();
  });

  test("a suspended clan's guest link takes nobody in", async ({ as }) => {
    const clanId = `e2e-clan-${crypto.randomUUID().slice(0, 8)}`;
    db().insert(clan).values({ id: clanId, name: `Clan ${clanId}`, slug: clanId, suspendedAt: new Date() }).run();
    const g = createGuest();
    db().update(user).set({ guestClanId: clanId }).where(eq(user.id, g.id)).run();
    const page = await as("ben");
    await page.goto(`/claim/${g.claimCode}`);
    await expect(page.getByText("This clan is suspended for now and can't take new members.")).toBeVisible();
    await expect(page.getByRole("button", { name: "That's me, take it over" })).toHaveCount(0);
    expect(guestExists(g.id)).toBe(true);
  });
});
