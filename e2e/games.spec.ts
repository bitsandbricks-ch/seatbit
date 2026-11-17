import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

test.describe("games", () => {
  test("last year's games of the same LAN type are one tap away", async ({ as }) => {
    const DAY = 86_400_000;
    const type = db().insert(schema.lanType).values({ name: `Type ${Date.now()}` }).returning().get();
    const last = createEvent({ name: `Last year ${Date.now()}` });
    const next = createEvent({ attendees: [{ who: "anna" }] });
    db()
      .update(schema.lan)
      .set({ typeId: type.id, startsAt: new Date(Date.now() - 365 * DAY), endsAt: new Date(Date.now() - 363 * DAY) })
      .where(eq(schema.lan.id, last))
      .run();
    db().update(schema.lan).set({ typeId: type.id }).where(eq(schema.lan.id, next)).run();
    db().insert(schema.game).values({ lanId: last, name: "Unreal Tournament", sizeGb: 8 }).run();
    db().insert(schema.game).values({ lanId: last, name: "Trackmania" }).run();
    db().insert(schema.game).values({ lanId: next, name: "trackmania" }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${next}?tab=games`);
    // Trackmania is on the list already (any case), so only Unreal is offered.
    await expect(anna.getByRole("button", { name: "Add Trackmania again" })).toHaveCount(0);
    await anna.getByRole("button", { name: "Add Unreal Tournament again" }).click();
    await expect(anna.getByRole("button", { name: "Add Unreal Tournament again" })).toHaveCount(0);
    // Added like any other game: on the list with 8 GB, and Anna's vote.
    const row = anna.getByRole("listitem").filter({ hasText: "Unreal Tournament" }).filter({ hasText: "8 GB" });
    await expect(row.getByText(/^1 vote: Anna/)).toBeVisible();
  });

  test("vote and installed show at once and are saved", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    const g = db().insert(schema.game).values({ lanId: id, name: "Worms" }).returning().get();
    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=games`);
    const row = anna.getByRole("listitem").filter({ hasText: "Worms" });
    // check() fails unless the box is ticked right after the click, before the server answers.
    await row.getByRole("checkbox", { name: "Installed" }).check();
    await row.getByRole("button", { name: "▲ Vote" }).click();
    await expect(row.getByRole("button", { name: "▲ Voted" })).toBeVisible();
    await expect(row.getByText(/^1 vote: Anna/)).toBeVisible();
    await expect(row.getByRole("checkbox", { name: "Installed" })).toBeChecked();
    expect(db().select().from(schema.gameVote).where(eq(schema.gameVote.gameId, g.id)).get()).toMatchObject({
      userId: userId("anna"),
      vote: true,
      installed: true,
    });
  });

  test("who added a game can fix it later, others can't", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "david" }] });
    const g = db().insert(schema.game).values({ lanId: id, name: "Quak", sizeGb: 1, addedBy: userId("anna") }).returning().get();
    db().insert(schema.gameVote).values({ gameId: g.id, userId: userId("ben"), vote: true }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=games`);
    await anna.getByRole("button", { name: "Edit Quak" }).click();
    const form = anna.getByRole("form", { name: "Edit game" });
    await form.getByLabel("Game").fill("Quake Live");
    await form.getByLabel("Size in GB").fill("12");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(anna.getByText("Quake Live")).toBeVisible();
    await expect(anna.getByText("12 GB", { exact: true })).toBeVisible();
    // Votes stay when a game is edited.
    await expect(anna.getByText("1 vote")).toBeVisible();

    const david = await as("david");
    await david.goto(`/lans/${id}?tab=games`);
    await expect(david.getByText("Quake Live")).toBeVisible();
    await expect(david.getByRole("button", { name: "Edit Quake Live" })).toHaveCount(0);
  });

  test("a lead can edit any game, but not into a name that is already on the list", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    db().insert(schema.game).values({ lanId: id, name: "Rocket League", addedBy: userId("anna") }).run();
    db().insert(schema.game).values({ lanId: id, name: "Trackmania", addedBy: userId("anna") }).run();

    const alex = await as("alex");
    await alex.goto(`/lans/${id}?tab=games`);
    await alex.getByRole("button", { name: "Edit Trackmania" }).click();
    const form = alex.getByRole("form", { name: "Edit game" });
    await form.getByLabel("Game").fill("rocket league");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(alex.getByText("There is already a game called Rocket League.")).toBeVisible();

    await form.getByLabel("Game").fill("Trackmania 2");
    await form.getByLabel("Store link").fill("https://example.com/trackmania");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(alex.getByRole("link", { name: "Trackmania 2" })).toHaveAttribute("href", "https://example.com/trackmania");
  });
});

test.describe("tournament teams", () => {
  test("a member starts a team, another joins until it is full, the captain takes someone out", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "ben" }, { who: "chiara" }] });
    const g = db().insert(schema.game).values({ lanId: id, name: "Counter-Strike 2", addedBy: userId("anna") }).returning().get();
    db().insert(schema.gameVote).values({ gameId: g.id, userId: userId("ben"), vote: true }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=games`);
    await anna.getByRole("button", { name: "Team", exact: true }).click();
    const panel = anna.getByRole("dialog", { name: "New team for Counter-Strike 2" });
    await panel.getByLabel("Team name").fill("Lizards A");
    await panel.getByLabel("Players").fill("2");
    await panel.getByRole("button", { name: "Create team" }).click();
    await expect(anna.getByRole("button", { name: /Lizards A/ })).toContainText("1/2");

    const ben = await as("ben");
    await ben.goto(`/lans/${id}?tab=games`);
    await ben.getByRole("button", { name: /Lizards A/ }).click();
    const team = ben.getByRole("dialog", { name: "Lizards A" });
    await expect(team.getByText("1 player missing")).toBeVisible();
    await team.getByRole("button", { name: "Join" }).click();
    await expect(team.getByText("Full", { exact: false })).toBeVisible();

    // Full: Chiara can't join.
    const chiara = await as("chiara");
    await chiara.goto(`/lans/${id}?tab=games`);
    await chiara.getByRole("button", { name: /Lizards A/ }).click();
    await expect(chiara.getByRole("dialog", { name: "Lizards A" }).getByRole("button", { name: "Join" })).toHaveCount(0);

    // The captain takes Ben out again, after confirming.
    await anna.reload();
    await anna.getByRole("button", { name: /Lizards A/ }).click();
    await anna.getByRole("button", { name: /Take .*Ben.* out/ }).click();
    await anna.getByRole("dialog", { name: /Take .* out of Lizards A/ }).getByRole("button", { name: "Remove" }).click();
    await expect(anna.getByRole("dialog", { name: "Lizards A" }).getByText("1 player missing")).toBeVisible();
  });
});
