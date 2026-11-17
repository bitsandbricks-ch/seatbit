import { and, eq, like } from "drizzle-orm";
import { schema } from "../src/db";
import { CLAN_ID, CLAN_SLUG } from "./env";
import { db, expect, test } from "./fixtures";

test.afterEach(() => {
  db().delete(schema.lanType).where(like(schema.lanType.name, "E2E LAN %")).run();
});

// LAN types are global: platform staff add one, a clan picks it with its own seats, and new events use both.
test("staff add a LAN type, a clan picks it and creates an event from it", async ({ as }) => {
  const name = `E2E LAN ${Date.now()}`;
  const alex = await as("alex");
  await alex.goto("/admin/types/new");
  await alex.getByLabel("Name").fill(name);
  await alex.getByLabel("Usual location").fill("Hall 7");
  await alex.getByRole("button", { name: "Add type" }).click();
  await alex.waitForURL(/\/admin\/types$/);
  await expect(alex.getByText(name)).toBeVisible();
  const type = db().select().from(schema.lanType).where(eq(schema.lanType.name, name)).get()!;

  const ben = await as("ben");
  await ben.goto(`/clans/${CLAN_SLUG}/settings?tab=types`);
  await ben.getByLabel("Add a LAN type your clan goes to").selectOption(type.id);
  await ben.getByRole("button", { name: "Add", exact: true }).click();
  await ben.waitForURL(new RegExp(`/types/${type.id}`));
  await ben.getByLabel("Usual seats").fill("Z1-Z4");
  await ben.getByLabel("Usual group spots").fill("4");
  await ben.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ben.getByRole("list", { name: "Notifications" }).getByText("Saved.")).toBeVisible();
  const own = () =>
    db()
      .select()
      .from(schema.clanLanType)
      .where(and(eq(schema.clanLanType.clanId, CLAN_ID), eq(schema.clanLanType.typeId, type.id)))
      .get();
  expect(own()).toMatchObject({ seatSpec: "Z1-Z4", capacity: 4 });

  // The new event takes the shared details and the clan's own spots.
  await ben.goto(`/clans/${CLAN_SLUG}/lans/new?type=${type.id}`);
  await expect(ben.getByLabel("Event name")).toHaveValue(new RegExp(`^${name} \\d{4}$`));
  await expect(ben.getByText("Z1-Z4")).toBeVisible();
});

test("only platform staff edit LAN types", async ({ as }) => {
  const anna = await as("anna");
  await anna.goto("/admin/types");
  await expect(anna).not.toHaveURL(/\/admin\/types/);
  const ben = await as("ben");
  await ben.goto(`/clans/${CLAN_SLUG}/types/demo-type-lakeside`);
  await expect(ben.getByRole("link", { name: "Edit for everyone" })).toHaveCount(0);
});
