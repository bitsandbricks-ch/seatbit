import { createEvent, expect, test } from "./fixtures";

test.describe("live updates", () => {
  test("an open page shows someone else's change without a reload", async ({ as }) => {
    const id = createEvent();
    const lead = await as("alex");
    await lead.goto(`/lans/${id}/manage?tab=attendees`);
    // Survives a client-side refresh, not a reload.
    await lead.evaluate(() => {
      (window as unknown as { marker?: number }).marker = 1;
    });
    const coming = lead.getByRole("button", { name: /^coming \d+$/ });
    await expect(coming).toHaveText(/0/);

    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    await anna.getByRole("region", { name: "Your attendance" }).getByRole("button", { name: "I'm coming" }).click();

    // The lead's page re-rendered in place: Anna is listed and the page was never reloaded.
    await expect(coming).toHaveText(/1/, { timeout: 10_000 });
    await expect(lead.getByRole("listitem").filter({ hasText: "Nova" })).toBeVisible();
    expect(await lead.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  });

  test("the live stream is only open to people who can see the event", async ({ as }) => {
    const id = createEvent();
    const anna = await as("anna");
    await anna.goto(`/lans/${id}`);
    const ok = await anna.evaluate(async (url) => {
      const c = new AbortController();
      const r = await fetch(url, { signal: c.signal });
      const type = r.headers.get("content-type");
      c.abort();
      return { status: r.status, type };
    }, `/api/live/${id}`);
    expect(ok.status).toBe(200);
    expect(ok.type).toContain("text/event-stream");
    const missing = await anna.evaluate(async (url) => (await fetch(url)).status, "/api/live/no-such-event");
    expect(missing).toBe(404);
  });
});
