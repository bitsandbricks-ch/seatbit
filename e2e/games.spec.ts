import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

test.describe("games", () => {
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
