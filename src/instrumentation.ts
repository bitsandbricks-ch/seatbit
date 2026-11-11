/**
 * Built-in reminder scheduler for self-hosted setups: checks for due reminders
 * every REMINDER_INTERVAL_MINUTES (default 60). Set it to 0 to disable and use
 * /api/cron/reminders instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const minutes = Number(process.env.REMINDER_INTERVAL_MINUTES ?? 60);
  if (!minutes) return;
  const { runDueReminders } = await import("./lib/reminders");
  const tick = () =>
    runDueReminders()
      .then((r) => r.length && console.log("[reminders] sent", r))
      .catch((e) => console.error("[reminders] failed", e));
  setTimeout(tick, 10_000);
  setInterval(tick, minutes * 60 * 1000);
}
