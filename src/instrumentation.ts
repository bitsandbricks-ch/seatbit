/**
 * Built-in reminder scheduler for self-hosted setups: checks for due reminders
 * every N minutes, where N is the "Reminder check interval" platform setting
 * (env REMINDER_INTERVAL_MINUTES, default 60). 0 turns it off; use
 * /api/cron/reminders instead. Changes in the admin UI apply without a restart.
 * The same timer also publishes scheduled events and makes the scheduled database backups.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runDueReminders } = await import("./lib/reminders");
  const { getNumberSetting } = await import("./lib/settings");
  let last = 0;
  const tick = () => {
    const minutes = getNumberSetting("reminders.intervalMinutes") ?? 60;
    if (!minutes || Date.now() - last < minutes * 60 * 1000) return;
    last = Date.now();
    runDueReminders()
      .then((r) => r.length && console.log("[reminders] sent", r))
      .catch((e) => console.error("[reminders] failed", e));
  };
  // Scheduled event publishing is checked every minute, whatever the reminder interval.
  const { publishDueDrafts } = await import("./lib/event-notices");
  const publishTick = () => void publishDueDrafts().catch((e) => console.error("[publish] failed", e));
  // Scheduled database backups (interval and folder from the platform settings).
  const { runScheduledBackup } = await import("./lib/backup");
  const backupTick = () => void runScheduledBackup().catch((e) => console.error("[backup] failed", e));
  // First check shortly after start, then look every minute whether the interval has passed.
  setTimeout(() => {
    publishTick();
    tick();
    backupTick();
  }, 10_000);
  setInterval(() => {
    publishTick();
    tick();
    backupTick();
  }, 60_000);
}
