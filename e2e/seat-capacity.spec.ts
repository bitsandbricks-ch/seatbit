import { and, eq } from "drizzle-orm";
import { attendance } from "../src/db/schema";
import { createEvent, db, expect, test, userId } from "./fixtures";

const statusOf = (lanId: string, who: "anna" | "ben") =>
  db().select().from(attendance).where(and(eq(attendance.lanId, lanId), eq(attendance.userId, userId(who)))).get()?.status;

// With a seat plan, the seats are the event's spots: the typed number no longer counts.
test("the seat plan sets the size: a new seat moves the waitlist up", async ({ as }) => {
  const id = createEvent({ capacity: 5, seats: ["A1"], attendees: [{ who: "ben", status: "going" }] });

  const anna = await as("anna");
  await anna.goto(`/lans/${id}`);
  await anna.getByRole("button", { name: "I'm coming" }).click();
  await expect.poll(() => statusOf(id, "anna")).toBe("waitlist");

  const alex = await as("alex");
  await alex.goto(`/lans/${id}/manage?tab=seats`);
  await alex.getByLabel("Seats the event gave us").fill("A1-A2");
  await alex.getByRole("button", { name: "Save seats" }).click();
  await expect(alex.getByText("Saved 2 seats.")).toBeVisible();
  await expect.poll(() => statusOf(id, "anna")).toBe("going");

  // The event's settings show the seat count instead of an editable number.
  await alex.goto(`/lans/${id}/manage?tab=settings`);
  const spots = alex.getByRole("spinbutton", { name: /Group spots/ });
  await expect(spots).toHaveValue("2");
  await expect(spots).toBeDisabled();
});
