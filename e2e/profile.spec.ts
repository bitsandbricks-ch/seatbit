import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_SLUG } from "./env";
import { db, expect, test, userId } from "./fixtures";

const { user, nickname } = schema;
const ELENA = userId("elena");

// Elena's profile is changed here and put back afterwards, so other tests keep the demo data.
let saved: { u: typeof user.$inferSelect; nicks: (typeof nickname.$inferSelect)[] };
test.beforeEach(() => {
  saved = {
    u: db().select().from(user).where(eq(user.id, ELENA)).get()!,
    nicks: db().select().from(nickname).where(eq(nickname.userId, ELENA)).all(),
  };
});
test.afterEach(() => {
  const { id, ...rest } = saved.u;
  db().update(user).set(rest).where(eq(user.id, id)).run();
  db().delete(nickname).where(eq(nickname.userId, ELENA)).run();
  if (saved.nicks.length) db().insert(nickname).values(saved.nicks).run();
});

// What a member edits on their profile is what clanmates see on the member page.
test.describe("profile", () => {
  test("a new nickname and socials show on the member page", async ({ as }) => {
    const elena = await as("elena");
    await elena.goto("/profile");
    await elena.getByRole("textbox", { name: /^Nickname / }).filter({ visible: true }).fill("Ember");
    await elena.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(elena.getByRole("list", { name: "Notifications" }).getByText("Saved")).toBeVisible();

    await elena.goto("/profile?tab=socials");
    await elena.getByLabel("Twitch", { exact: true }).filter({ visible: true }).fill("@ember_plays");
    await elena.getByLabel("Battle.net", { exact: true }).filter({ visible: true }).fill("Ember#1234");
    await elena.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
    await expect(elena.getByRole("list", { name: "Notifications" }).getByText("Saved")).toBeVisible();
    expect(db().select().from(user).where(eq(user.id, ELENA)).get()?.socials).toEqual({ battlenet: "Ember#1234", twitch: "@ember_plays" });

    const anna = await as("anna");
    await anna.goto(`/clans/${CLAN_SLUG}/members/${ELENA}`);
    await expect(anna.getByRole("heading", { name: /Elena "Ember" Schmid/ })).toBeVisible();
    await expect(anna.getByRole("link", { name: "@ember_plays" })).toHaveAttribute("href", "https://www.twitch.tv/ember_plays");
    // No profile page for Battle.net: shown as text to copy.
    await expect(anna.getByText("Ember#1234")).toBeVisible();
    await expect(anna.getByRole("link", { name: "Ember#1234" })).toHaveCount(0);
  });

  test("first name and surname can't be emptied", async ({ as }) => {
    const elena = await as("elena");
    await elena.goto("/profile");
    await elena.getByLabel("First name", { exact: true }).filter({ visible: true }).fill(" ");
    await elena.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(elena.getByRole("list", { name: "Errors" })).toBeVisible();
    expect(db().select().from(user).where(eq(user.id, ELENA)).get()?.firstName).toBe("Elena");
  });
});
