import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_SLUG } from "./env";
import { db, expect, test, userId } from "./fixtures";

const TYPE = "demo-type-lakeside";
const anna = userId("anna");
const lanId = () =>
  db().select().from(schema.lanAccount).where(and(eq(schema.lanAccount.userId, anna), eq(schema.lanAccount.typeId, TYPE))).get()?.value;
/** The Lakeside LAN fields in the open edit form. */
const lakeside = (page: import("@playwright/test").Page) => page.locator("fieldset > div", { hasText: "Lakeside LAN" });
const nick = () =>
  db().select().from(schema.nickname).where(and(eq(schema.nickname.userId, anna), eq(schema.nickname.typeId, TYPE))).get()?.nick;

// Put Anna's demo values back, so other tests and the screenshots see the seed.
test.afterEach(() => {
  db().delete(schema.lanAccount).where(and(eq(schema.lanAccount.userId, anna), eq(schema.lanAccount.typeId, TYPE))).run();
  db().insert(schema.lanAccount).values({ userId: anna, typeId: TYPE, value: "48213" }).run();
  db().delete(schema.nickname).where(and(eq(schema.nickname.userId, anna), eq(schema.nickname.typeId, TYPE))).run();
  db().insert(schema.nickname).values({ userId: anna, typeId: TYPE, nick: "NovaFox" }).run();
  db().delete(schema.auditLog).where(and(eq(schema.auditLog.action, "member.lan_info"), eq(schema.auditLog.targetUserId, anna))).run();
});

test("a clan admin sets a member's LAN ID and nick", async ({ as }) => {
  const ben = await as("ben");
  await ben.goto(`/clans/${CLAN_SLUG}/members/${anna}`);
  await ben.getByText("Edit nicks & LAN IDs").click();
  await lakeside(ben).getByRole("textbox", { name: "LAN ID" }).fill("50001");
  await lakeside(ben).getByRole("textbox", { name: "Nick" }).fill("E2EFox");
  await ben.getByRole("button", { name: "Save" }).click();
  await expect(ben.getByRole("list", { name: "Notifications" }).getByText("Saved.")).toBeVisible();
  expect(lanId()).toBe("50001");
  expect(nick()).toBe("E2EFox");
  const log = db().select().from(schema.auditLog).where(eq(schema.auditLog.action, "member.lan_info")).all();
  expect(log.find((e) => e.targetUserId === anna)?.data).toMatchObject({ fields: ["nicks", "LAN IDs"] });
});

test("a platform owner sets it from the user's admin page", async ({ as }) => {
  const alex = await as("alex");
  await alex.goto(`/admin/users/${anna}`);
  await alex.getByText("Edit nicks & LAN IDs").click();
  await lakeside(alex).getByRole("textbox", { name: "LAN ID" }).fill("");
  await alex.getByRole("button", { name: "Save" }).click();
  await expect(alex.getByRole("list", { name: "Notifications" }).getByText("Saved.")).toBeVisible();
  expect(lanId()).toBeUndefined();
});

test("a plain member can't edit someone else's", async ({ as }) => {
  const chiara = await as("chiara");
  await chiara.goto(`/clans/${CLAN_SLUG}/members/${anna}`);
  await expect(chiara.getByRole("heading", { name: "Nicks" })).toBeVisible();
  await expect(chiara.getByText("Edit nicks & LAN IDs")).toHaveCount(0);
});
