import { eq } from "drizzle-orm";
import type { Page } from "@playwright/test";
import { schema } from "../src/db";
import { createEvent, db, expect, test, userId } from "./fixtures";

const tabs = (p: Page) => p.getByRole("navigation", { name: "Sections" });
const glance = (p: Page) => p.locator("section", { has: p.getByRole("heading", { name: "At a glance" }) });
const DAY = 864e5;

test.describe("event page clarity", () => {
  test("«How this event works» explains the flow and marks where you are", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2"], seatPicking: true, attendees: [{ who: "anna", ticket: true }] });

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await anna.getByRole("region", { name: "Your checklist" }).getByRole("button", { name: "How this event works" }).click();
    const panel = anna.getByRole("dialog");
    await expect(panel.getByRole("heading", { name: "How this event works" })).toBeVisible();
    await expect(panel.getByText("You are here")).toBeVisible();
    await expect(panel.getByText(/block of 2 seats \(A1–A2\)/)).toBeVisible();
    await expect(panel.getByText("Who are the organizers?")).toBeVisible();
    await expect(panel.getByText(/Alex/).first()).toBeVisible();
    await panel.getByRole("button", { name: "Close" }).click();
    await expect(panel).toBeHidden();

    // The same panel from the header's question mark.
    await anna.getByRole("button", { name: "How this event works" }).first().click();
    await expect(anna.getByRole("dialog")).toBeVisible();
  });

  test("on the waitlist the checklist says to wait instead of pointing to the ticket shop", async ({ as }) => {
    const id = createEvent({ capacity: 1, attendees: [{ who: "ben" }] });
    db().insert(schema.attendance).values({ lanId: id, userId: userId("anna"), status: "waitlist", waitlistedAt: new Date() }).run();
    db().update(schema.lan).set({ ticketUrl: "https://example.com/tickets" }).where(eq(schema.lan.id, id)).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const checklist = anna.getByRole("region", { name: "Your checklist" });
    await expect(checklist.getByText("Wait for a spot")).toBeVisible();
    await expect(checklist.getByRole("link", { name: /Ticket shop/ })).toHaveCount(0);
  });

  test("the Trip tab opens a month before the event, earlier once something is in it", async ({ as }) => {
    const id = createEvent({ attendees: [{ who: "anna" }] });
    db().update(schema.lan).set({ startsAt: new Date(Date.now() + 60 * DAY), endsAt: new Date(Date.now() + 62 * DAY) }).where(eq(schema.lan.id, id)).run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await expect(tabs(anna).getByRole("link", { name: /^Trip/ })).toHaveCount(0);
    await expect(glance(anna).getByText(/^Opens /)).toBeVisible();

    // Leads see it, marked as hidden from the others.
    const alex = await as("alex");
    await alex.goto(`/lans/${id}`);
    await expect(tabs(alex).getByRole("link", { name: /Trip/ })).toHaveAttribute("title", /^Opens /);

    // Someone posts a ride: it opens for everyone.
    db().insert(schema.travelPost).values({ lanId: id, userId: userId("alex"), kind: "ride", mode: "offer", town: "Zug" }).run();
    await anna.goto(`/lans/${id}`);
    await expect(tabs(anna).getByRole("link", { name: /^Trip/ })).toBeVisible();
  });

  test("you see who wants to sit near you and can wish it back", async ({ as }) => {
    const id = createEvent({ seats: ["A1", "A2", "A3"], attendees: [{ who: "anna", ticket: true }, { who: "ben", ticket: true }] });
    db()
      .update(schema.attendance)
      .set({ wishRules: [{ kind: "next", userId: userId("anna") }] })
      .where(eq(schema.attendance.userId, userId("ben")))
      .run();

    const anna = await as("anna");
    await anna.goto(`/lans/${id}?tab=seats`);
    const box = anna.getByText("Want to sit near you").locator("..").locator("..");
    await expect(box.getByText("· right next to you")).toBeVisible();
    await box.getByRole("button", { name: "+ Add as my wish" }).click();
    await expect
      .poll(() => db().select().from(schema.attendance).where(eq(schema.attendance.userId, userId("anna"))).all().find((r) => r.lanId === id)?.wishRules)
      .toEqual([{ kind: "near", userId: userId("ben") }]);
  });

  test("the help page lists the topics and opens the answers", async ({ as }) => {
    const anna = await as("anna");
    await anna.goto("/help");
    await expect(anna.getByRole("heading", { name: "Help", exact: true })).toBeVisible();
    await anna.getByRole("navigation", { name: "Help topics" }).getByRole("link", { name: /Seats/ }).click();
    await anna.getByText("What are seat wishes?").click();
    await expect(anna.getByText(/Your top wish counts most/)).toBeVisible();
  });
});
