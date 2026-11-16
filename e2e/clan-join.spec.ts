import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { db, expect, test, userId, type Who } from "./fixtures";

const { clan, clanMember } = schema;

/** A fresh clan led by Alex, so join tests don't touch the demo clans. Returns its slug and id. */
function createClan(joinPolicy: "open" | "approval" | "invite") {
  const id = `e2e-clan-${crypto.randomUUID().slice(0, 8)}`;
  db().insert(clan).values({ id, name: `Clan ${id}`, slug: id, joinPolicy }).run();
  db().insert(clanMember).values({ clanId: id, userId: userId("alex"), role: "admin" }).run();
  return id;
}

const roleOf = (clanId: string, who: Who) =>
  db()
    .select({ role: clanMember.role })
    .from(clanMember)
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.userId, userId(who))))
    .get()?.role;

// Joining a clan: open clans let you in, approval clans wait for an admin, invite-only clans need a link.
test.describe("joining a clan", () => {
  test("an admin approves a join request", async ({ as }) => {
    const id = createClan("approval");
    const anna = await as("anna");
    await anna.goto(`/clans/${id}`);
    await anna.getByRole("button", { name: "Ask to join" }).click();
    await expect(anna.getByText("Waiting for approval").first()).toBeVisible();
    expect(roleOf(id, "anna")).toBe("pending");

    const alex = await as("alex");
    await alex.goto(`/clans/${id}/settings?tab=members`);
    await alex.getByRole("button", { name: "Approve" }).click();
    await expect(alex.getByRole("button", { name: "Approve" })).toBeHidden();
    expect(roleOf(id, "anna")).toBe("member");

    await anna.reload();
    await expect(anna.getByText("Waiting for approval")).toBeHidden();
    await expect(anna.getByRole("button", { name: "Ask to join" })).toBeHidden();
  });

  test("an admin declines a join request", async ({ as }) => {
    const id = createClan("approval");
    db().insert(clanMember).values({ clanId: id, userId: userId("ben"), role: "pending" }).run();
    const alex = await as("alex");
    await alex.goto(`/clans/${id}/settings?tab=members`);
    await alex.getByRole("button", { name: "Decline" }).click();
    await expect(alex.getByRole("button", { name: "Decline" })).toBeHidden();
    expect(roleOf(id, "ben")).toBeUndefined();
  });

  test("an open clan lets you in right away, an invite-only one doesn't offer to join", async ({ as }) => {
    const open = createClan("open");
    const closed = createClan("invite");
    const anna = await as("anna");
    await anna.goto(`/clans/${open}`);
    await anna.getByRole("button", { name: "Join", exact: true }).click();
    await expect(anna.getByRole("button", { name: "Join", exact: true })).toBeHidden();
    expect(roleOf(open, "anna")).toBe("member");

    await anna.goto(`/clans/${closed}`);
    await expect(anna.getByRole("heading", { name: `Clan ${closed}` })).toBeVisible();
    await expect(anna.getByRole("button", { name: /join/i })).toHaveCount(0);
    expect(roleOf(closed, "anna")).toBeUndefined();
  });

  test("an invite link lets you into an invite-only clan", async ({ as }) => {
    const id = createClan("invite");
    const code = crypto.randomBytes(8).toString("hex");
    db().insert(schema.clanInvite).values({ code, clanId: id, createdBy: userId("alex") }).run();
    const anna = await as("anna");
    await anna.goto(`/join/${code}`);
    await anna.getByRole("button", { name: "Join clan" }).click();
    await expect(anna).toHaveURL(new RegExp(`/clans/${id}(\\?.*)?$`));
    expect(roleOf(id, "anna")).toBe("member");
  });
});
