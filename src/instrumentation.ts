import type { Instrumentation } from "next";

/**
 * Built-in reminder scheduler for self-hosted setups: checks for due reminders
 * every N minutes, where N is the "Reminder check interval" platform setting
 * (env REMINDER_INTERVAL_MINUTES, default 60). 0 turns it off; use
 * /api/cron/reminders instead. Changes in the admin UI apply without a restart.
 * The same timer also publishes scheduled events, makes the scheduled database backups and tests them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runDueReminders } = await import("./lib/reminders");
  const { getNumberSetting } = await import("./lib/settings");
  const { runJob } = await import("./lib/jobs");
  const { reportError } = await import("./lib/ops");
  let last = 0;
  const tick = () => {
    const minutes = getNumberSetting("reminders.intervalMinutes") ?? 60;
    if (!minutes || Date.now() - last < minutes * 60 * 1000) return;
    last = Date.now();
    runJob("reminders", runDueReminders)
      .then((r) => r.length && console.log("[reminders] sent", r))
      .catch((e) => {
        console.error("[reminders] failed", e);
        reportError("reminders", e);
      });
  };
  // Scheduled event publishing is checked every minute, whatever the reminder interval.
  const { publishDueDrafts } = await import("./lib/event-notices");
  const publishTick = () =>
    void runJob("publish", () => publishDueDrafts()).catch((e) => {
      console.error("[publish] failed", e);
      reportError("publish", e);
    });
  // After an upgrade: register changed slash commands and tell the platform admins (once per version),
  // and the ops and announcements channels.
  const { afterUpgrade, onUpgrade } = await import("./lib/upgrade");
  const { announceUpgradeOnDiscord } = await import("./lib/ops");
  onUpgrade(announceUpgradeOnDiscord);
  (await import("./lib/ops-hooks")).registerOpsHooks();
  setTimeout(
    () =>
      void runJob("upgrade", () => afterUpgrade()).catch((e) => {
        console.error("[upgrade] failed", e);
        reportError("upgrade", e);
      }),
    15_000,
  );
  // Scheduled database backups (interval and folder from the platform settings).
  // Each new backup then gets a restore test (also ones a cron job wrote).
  const { runScheduledBackup } = await import("./lib/backup");
  const { runScheduledDrill } = await import("./lib/backup-drill");
  const backupTick = () =>
    void runScheduledBackup()
      .then(() => runScheduledDrill())
      .catch((e) => console.error("[backup] failed", e));
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

/** Server errors go to the platform ops Discord channel (if set up) and the admin Health page. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // notFound(), redirect() and friends travel as errors too; they aren't problems.
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : "";
  if (/^(NEXT_|DYNAMIC_SERVER_USAGE)/.test(digest)) return;
  const { reportError, safePath } = await import("./lib/ops");
  reportError(`${request.method} ${safePath(request.path)}`, err, [
    { name: "Route", value: `${context.routePath} (${context.routeType})` },
    ...(digest ? [{ name: "Digest", value: digest }] : []),
  ]);
};
