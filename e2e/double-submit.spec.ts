import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID, CLAN_SLUG } from "./env";
import { db, expect, test } from "./fixtures";

const invites = () => db().select().from(schema.clanInvite).where(eq(schema.clanInvite.clanId, CLAN_ID)).all();
let before: string[] = [];
test.beforeEach(() => {
  before = invites().map((i) => i.code);
});
test.afterEach(() => {
  for (const i of invites()) if (!before.includes(i.code)) db().delete(schema.clanInvite).where(eq(schema.clanInvite.code, i.code)).run();
});

// A double click (or an impatient second click on a slow connection) sends a form once.
test("a double click creates one invite link, not two", async ({ as }) => {
  const alex = await as("alex");
  await alex.goto(`/clans/${CLAN_SLUG}/settings?tab=invites`);
  const button = alex.getByRole("button", { name: "Create invite link" });
  await expect(async () => {
    await button.dblclick();
    await expect(alex.getByRole("list", { name: "Notifications" }).getByText("Saved.")).toBeVisible({ timeout: 2000 });
  }).toPass();
  await alex.waitForTimeout(1000);
  expect(invites().length - before.length).toBe(1);
});
