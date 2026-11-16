import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID } from "./env";
import { createEvent, db, expect, signInById, test } from "./fixtures";

// Someone deletes their own account: what they typed is checked, they're signed out, and their
// upcoming answer and clan membership are gone while the clan stays.
test("a member deletes their account", async ({ browser }) => {
  const id = `e2e-leaver-${Date.now()}`;
  const now = new Date();
  db()
    .insert(schema.user)
    .values({ id, name: "Lea Weg", firstName: "Lea", lastName: "Weg", email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now })
    .run();
  db().insert(schema.clanMember).values({ clanId: CLAN_ID, userId: id, role: "member" }).run();
  const lanId = createEvent();
  db().insert(schema.attendance).values({ lanId, userId: id, status: "going" }).run();

  const context = await browser.newContext();
  try {
    await signInById(context, id);
    const page = await context.newPage();
    await page.goto("/profile?tab=data");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    const confirm = page.getByRole("textbox", { name: "Type DELETE to confirm" });
    const go = page.getByRole("button", { name: "Delete my account", exact: true });
    await confirm.fill("delete it");
    await expect(go).toBeDisabled();
    await confirm.fill("DELETE");
    await go.click();

    await page.waitForURL(/\/login\?deleted=1/);
    await expect(page.getByText("Your account and your data were deleted.")).toBeVisible();
    expect(db().select().from(schema.user).where(eq(schema.user.id, id)).get()?.deletedAt).toBeTruthy();
    expect(db().select().from(schema.clanMember).where(eq(schema.clanMember.userId, id)).all()).toEqual([]);
    expect(db().select().from(schema.attendance).where(and(eq(schema.attendance.lanId, lanId), eq(schema.attendance.userId, id))).all()).toEqual([]);
    expect(db().select().from(schema.clan).where(eq(schema.clan.id, CLAN_ID)).get()).toBeTruthy();

    // Signed out: the profile asks to sign in again.
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  } finally {
    await context.close();
  }
});
