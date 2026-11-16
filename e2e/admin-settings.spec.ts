import { inArray } from "drizzle-orm";
import { schema } from "../src/db";
import { db, expect, test } from "./fixtures";

const KEYS = ["legal.operatorName", "legal.contactEmail", "maintenance.message", "maintenance.startsAt", "maintenance.endsAt"];
// The test clears what it set through the page; this only catches a test that stopped halfway.
test.afterEach(() => {
  db().delete(schema.appSetting).where(inArray(schema.appSetting.key, KEYS)).run();
});

test.describe("platform settings", () => {
  test("the operator sets their details, which the terms then show", async ({ as }) => {
    const alex = await as("alex");
    await alex.goto("/admin/settings?tab=legal");
    const name = alex.getByLabel("Operator name", { exact: true });
    const email = alex.getByLabel("Contact email", { exact: true });
    const save = alex.getByRole("button", { name: "Save", exact: true }).filter({ visible: true });
    const toasts = alex.getByRole("list", { name: "Notifications" });

    // A wrong value saves nothing at all, not even the valid fields next to it.
    await name.fill("Example Gaming Club");
    await email.fill("not-an-email");
    await save.click();
    await expect(alex.getByRole("list", { name: "Errors" })).toContainText("Contact email: Enter an email address");
    expect(db().select().from(schema.appSetting).where(inArray(schema.appSetting.key, KEYS)).all()).toEqual([]);
    // What they typed stays, so they only fix the wrong field.
    await expect(name).toHaveValue("Example Gaming Club");
    await expect(email).toHaveValue("not-an-email");

    await email.fill("lan@example.com");
    await save.click();
    await expect(toasts).toContainText("Saved 2 changes.");
    await alex.goto("/terms");
    await expect(alex.getByText("Example Gaming Club").first()).toBeVisible();

    // Emptied fields go back to the defaults.
    await alex.goto("/admin/settings?tab=legal");
    await name.fill("");
    await email.fill("");
    await save.click();
    await expect(toasts).toContainText("Saved 2 changes.");
    await alex.goto("/terms");
    await expect(alex.getByText("Example Gaming Club")).toHaveCount(0);
  });

  test("a maintenance notice with the end before the start keeps what was typed", async ({ as }) => {
    const alex = await as("alex");
    await alex.goto("/admin/settings?tab=maintenance");
    const message = alex.getByLabel("Message", { exact: true });
    const starts = alex.getByRole("textbox", { name: "Starts", exact: true });
    const ends = alex.getByRole("textbox", { name: "Ends", exact: true });
    await message.fill("Server move tonight");
    await starts.fill("20.12.2027 22:00");
    await starts.blur();
    await ends.fill("20.12.2027 21:00");
    await ends.blur();
    await alex.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).click();
    await expect(alex.getByRole("list", { name: "Errors" })).toContainText("The end has to be after the start.");
    await expect(message).toHaveValue("Server move tonight");
    await expect(starts).toHaveValue(/20\.12\.2027, 22:00/);
    await expect(ends).toHaveValue(/20\.12\.2027, 21:00/);
    expect(db().select().from(schema.appSetting).where(inArray(schema.appSetting.key, KEYS)).all()).toEqual([]);
  });

  test("members can't open the platform settings", async ({ as }) => {
    const anna = await as("anna");
    await anna.goto("/admin/settings?tab=legal");
    await expect(anna).not.toHaveURL(/\/admin/);
    await expect(anna.getByLabel("Operator name")).toHaveCount(0);
  });
});
