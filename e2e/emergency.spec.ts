import { and, eq } from "drizzle-orm";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const { emergencyInfo, auditLog, lan } = schema;
const PHONE = "+41 79 000 11 22";

// Emergency info is health data: the member fills it in, only the event's leads see it, and every look is logged.
test.describe("emergency contact", () => {
  let saved: (typeof emergencyInfo.$inferSelect)[] = [];
  test.beforeEach(() => {
    saved = db().select().from(emergencyInfo).where(eq(emergencyInfo.userId, userId("anna"))).all();
  });
  test.afterEach(() => {
    db().delete(emergencyInfo).where(eq(emergencyInfo.userId, userId("anna"))).run();
    for (const row of saved) db().insert(emergencyInfo).values(row).run();
  });

  test("a member saves it, the lead sees it, other members don't", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }, { who: "david" }] });

    const anna = await as("anna");
    await anna.goto("/profile?tab=emergency");
    await anna.getByLabel("Emergency contact").fill("E2E Contact (sister)");
    await anna.getByLabel("Their phone number").fill(PHONE);
    await anna.getByLabel("Dietary needs and allergies").fill("E2E nut allergy");
    await expect(async () => {
      await anna.getByRole("button", { name: "Save" }).filter({ visible: true }).click();
      await expect(anna.getByRole("list", { name: "Notifications" })).toContainText(/saved/i, { timeout: 2000 });
    }).toPass();
    expect(db().select().from(emergencyInfo).where(eq(emergencyInfo.userId, userId("anna"))).get()).toMatchObject({
      contactName: "E2E Contact (sister)",
      contactPhone: PHONE,
      diet: "E2E nut allergy",
    });

    // The lead sees it with a phone link, and the look lands in the audit log.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}/manage?tab=emergency`);
    await expect(alex.getByText("E2E Contact (sister)")).toBeVisible();
    await expect(alex.getByRole("link", { name: PHONE })).toHaveAttribute("href", "tel:+41790001122");
    await expect(alex.getByText("E2E nut allergy").first()).toBeVisible();
    const logged = db()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "emergency.view"), eq(auditLog.actorId, userId("alex"))))
      .all();
    expect(logged.length).toBeGreaterThan(0);

    // David is coming too, but is a plain member and not a lead: no tab, no data.
    const david = await as("david");
    await david.goto(`/lans/${id}/manage?tab=emergency`);
    await expect(david.getByText("E2E nut allergy")).toHaveCount(0);
    await expect(david.getByText(PHONE)).toHaveCount(0);

    // Two days after the event ends, the tab closes for the lead too.
    const ended = new Date(Date.now() - 3 * 864e5);
    db().update(lan).set({ startsAt: new Date(+ended - 2 * 864e5), endsAt: ended }).where(eq(lan.id, id)).run();
    await alex.reload();
    await expect(alex.getByText("E2E nut allergy")).toHaveCount(0);
    await expect(alex.getByText(PHONE)).toHaveCount(0);
  });
});
