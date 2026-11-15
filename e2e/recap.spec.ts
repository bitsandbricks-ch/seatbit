import { eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const DAY = 86_400_000;

// After the LAN the overview looks back: who came, what was wanted, whether money is settled.
test.describe("event recap", () => {
  test("a finished event shows the recap, and leads can plan the next one", async ({ as }) => {
    const id = createEvent({ name: `Recap ${Date.now()}`, attendees: [{ who: "anna" }, { who: "ben" }, { who: "chiara", status: "declined" }] });
    db()
      .update(schema.lan)
      .set({ startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - DAY) })
      .where(eq(schema.lan.id, id))
      .run();
    const g = db().insert(schema.game).values({ lanId: id, name: "Quake", addedBy: userId("anna") }).returning().get();
    db().insert(schema.gameVote).values({ gameId: g.id, userId: userId("ben"), vote: true }).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await expect(anna.getByText("2 people came")).toBeVisible();
    await expect(anna.getByText("Most wanted games: Quake")).toBeVisible();
    await expect(anna.getByRole("link", { name: "Plan the next one" })).toHaveCount(0);

    const alex = await as("alex");
    await alex.goto(`/lans/${id}`);
    await alex.getByRole("link", { name: "Plan the next one" }).click();
    await expect(alex).toHaveURL(/\/clans\/pixel-pirates\/lans\/new/);
  });

  test("an upcoming event has no recap", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await expect(anna.getByText(/people came|person came/)).toHaveCount(0);
  });
});
