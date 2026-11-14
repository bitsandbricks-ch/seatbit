/**
 * Prometheus metrics for GET /api/metrics (text exposition format 0.0.4).
 * Gauges are read when Prometheus scrapes; counters count since the process started
 * (Prometheus handles the reset on restart). Only totals: no names, ids or clans,
 * so the endpoint shows nothing about a single person.
 */
import fs from "node:fs";
import { db, dbFile } from "../db";
import { backupDisk, backupIntervalHours, backupStatus, listBackups } from "./backup";
import { drillEnabled, lastDrill } from "./backup-drill";
import { jobsSnapshot } from "./jobs";
import { liveConnections } from "./live";

type Labels = Record<string, string>;
type Sample = { labels?: Labels; value: number };
type Metric = { name: string; help: string; type: "gauge" | "counter"; samples: Sample[] };

const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
const fmtLabels = (l?: Labels) =>
  l && Object.keys(l).length
    ? `{${Object.entries(l)
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(",")}}`
    : "";
const num = (n: number) => (Number.isFinite(n) ? String(n) : "NaN");

export function render(metrics: Metric[]): string {
  const out: string[] = [];
  for (const m of metrics) {
    out.push(`# HELP ${m.name} ${m.help}`, `# TYPE ${m.name} ${m.type}`);
    for (const s of m.samples) out.push(`${m.name}${fmtLabels(s.labels)} ${num(s.value)}`);
  }
  return out.join("\n") + "\n";
}

const gauge = (name: string, help: string, samples: Sample[] | number): Metric => ({
  name,
  help,
  type: "gauge",
  samples: typeof samples === "number" ? [{ value: samples }] : samples,
});
const counter = (name: string, help: string, samples: Sample[] | number): Metric => ({ ...gauge(name, help, samples), type: "counter" });

const secs = (ms: number | undefined) => (ms ? ms / 1000 : 0);
const fileSize = (f: string) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return 0;
  }
};
const scalar = (sql: string, ...args: unknown[]) => (db.$client.prepare(sql).get(...args) as { n: number | null }).n ?? 0;
/** YYYY-MM-DD in the server's time zone, as user_activity stores it. */
const day = (d: Date) => d.toLocaleDateString("sv-SE");

export function collect(): Metric[] {
  const now = Date.now();
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const snap = jobsSnapshot();
  const backups = listBackups();
  const bStatus = backupStatus();
  const disk = backupDisk();
  const drill = lastDrill();

  const metrics: Metric[] = [
    gauge("seatbit_info", "Version of the running server (always 1).", [
      { labels: { commit: process.env.SEATBIT_COMMIT || "dev", node: process.version }, value: 1 },
    ]),
    gauge("process_start_time_seconds", "Start time of the process since the Unix epoch.", (now - process.uptime() * 1000) / 1000),
    gauge("process_resident_memory_bytes", "Resident memory size.", mem.rss),
    gauge("nodejs_heap_used_bytes", "V8 heap in use.", mem.heapUsed),
    counter("process_cpu_seconds_total", "User and system CPU time spent.", (cpu.user + cpu.system) / 1e6),

    // Database
    gauge("seatbit_database_size_bytes", "Size of the SQLite database file.", fileSize(dbFile)),
    gauge("seatbit_database_wal_bytes", "Size of the SQLite write-ahead log.", fileSize(`${dbFile}-wal`)),

    gauge("seatbit_live_connections", "Open live update streams (event pages that refresh by themselves).", liveConnections()),

    // What the instance holds
    gauge("seatbit_users", "Accounts and guests, without deleted ones.", [
      { labels: { kind: "account" }, value: scalar("SELECT count(*) AS n FROM user WHERE deleted_at IS NULL AND is_guest = 0") },
      { labels: { kind: "guest" }, value: scalar("SELECT count(*) AS n FROM user WHERE deleted_at IS NULL AND is_guest = 1") },
    ]),
    gauge(
      "seatbit_active_users",
      "Accounts that used Seatbit in the last day, 7 days or 30 days (by calendar day).",
      ([1, 7, 30] as const).map((d) => ({
        labels: { window: `${d}d` },
        value: scalar("SELECT count(DISTINCT user_id) AS n FROM user_activity WHERE day >= ?", day(new Date(now - (d - 1) * 86400_000))),
      })),
    ),
    gauge("seatbit_sessions", "Signed-in sessions that haven't expired.", scalar("SELECT count(*) AS n FROM session WHERE expires_at > ?", now)),
    gauge("seatbit_clans", "Clans.", scalar("SELECT count(*) AS n FROM clan")),
    gauge("seatbit_events", "Events by state.", [
      { labels: { state: "draft" }, value: scalar("SELECT count(*) AS n FROM lan WHERE published_at IS NULL AND cancelled_at IS NULL") },
      { labels: { state: "upcoming" }, value: scalar("SELECT count(*) AS n FROM lan WHERE published_at IS NOT NULL AND cancelled_at IS NULL AND ends_at >= ?", now) },
      { labels: { state: "past" }, value: scalar("SELECT count(*) AS n FROM lan WHERE published_at IS NOT NULL AND cancelled_at IS NULL AND ends_at < ?", now) },
      { labels: { state: "cancelled" }, value: scalar("SELECT count(*) AS n FROM lan WHERE cancelled_at IS NOT NULL") },
    ]),
    gauge(
      "seatbit_upcoming_attendances",
      "Answers to published upcoming events, by answer.",
      (db.$client
        .prepare(
          "SELECT a.status AS status, count(*) AS n FROM attendance a JOIN lan l ON l.id = a.lan_id WHERE l.published_at IS NOT NULL AND l.cancelled_at IS NULL AND l.ends_at >= ? GROUP BY a.status",
        )
        .all(now) as { status: string; n: number }[]).map((r) => ({ labels: { status: r.status }, value: r.n })),
    ),
    gauge("seatbit_open_reports", "Abuse reports nobody has handled yet.", scalar("SELECT count(*) AS n FROM report WHERE status = 'open'")),

    // Background jobs (reminders, publish, backup, restore-test, upgrade)
    counter(
      "seatbit_job_runs_total",
      "Runs of a background job since the start.",
      snap.jobs.map((j) => ({ labels: { job: j.name }, value: j.runs })),
    ),
    counter(
      "seatbit_job_failures_total",
      "Failed runs of a background job since the start.",
      snap.jobs.map((j) => ({ labels: { job: j.name }, value: snap.counts.jobErrors[j.name] ?? 0 })),
    ),
    gauge(
      "seatbit_job_last_success_timestamp_seconds",
      "When a background job last finished without error (0 = not since the start).",
      snap.jobs.map((j) => ({ labels: { job: j.name }, value: secs(j.lastOk) })),
    ),
    gauge(
      "seatbit_job_running",
      "1 while a background job runs.",
      snap.jobs.map((j) => ({ labels: { job: j.name }, value: j.running ? 1 : 0 })),
    ),
    counter(
      "seatbit_problems_total",
      "Server errors, failed mails and failed Discord calls since the start (as on the Health page).",
      Object.entries(snap.counts.problems).map(([kind, value]) => ({ labels: { kind }, value })),
    ),
    counter("seatbit_mails_total", "Mails sent through SMTP since the start, by result.", [
      { labels: { result: "ok" }, value: snap.counts.mails.ok },
      { labels: { result: "failed" }, value: snap.counts.mails.failed },
    ]),

    // Backups
    gauge("seatbit_backup_files", "Backups in the backup folder.", backups.length),
    gauge("seatbit_backup_size_bytes", "All backups in the backup folder together.", backups.reduce((n, b) => n + b.size, 0)),
    gauge("seatbit_backup_last_timestamp_seconds", "When the newest backup was written (0 = none).", secs(backups[0]?.at.getTime())),
    gauge("seatbit_backup_interval_seconds", "Configured backup interval (0 = scheduled backups off).", Math.max(0, backupIntervalHours()) * 3600),
    gauge("seatbit_backup_last_failed", "1 when the last backup this process tried failed.", bStatus.lastError ? 1 : 0),
    gauge("seatbit_backup_restore_test_enabled", "1 when every new backup gets a restore test.", drillEnabled() ? 1 : 0),
    gauge("seatbit_backup_restore_test_ok", "1 when the last restore test passed, 0 when it failed or none ran yet.", drill?.ok ? 1 : 0),
    gauge("seatbit_backup_restore_test_timestamp_seconds", "When the last restore test ran (0 = never).", drill ? Date.parse(drill.at) / 1000 : 0),
    gauge(
      "seatbit_backup_restore_test_backup_timestamp_seconds",
      "When the backup the last passed restore test used was written (0 = none). Alert when this falls far behind seatbit_backup_last_timestamp_seconds.",
      drill?.ok && drill.backupAt ? Date.parse(drill.backupAt) / 1000 : 0,
    ),
    gauge("seatbit_backup_restore_test_duration_seconds", "How long the last restore test took.", drill ? drill.ms / 1000 : 0),
  ];
  if (disk) {
    metrics.push(
      gauge("seatbit_backup_disk_free_bytes", "Free space on the backup folder's disk.", disk.free),
      gauge("seatbit_backup_disk_size_bytes", "Size of the backup folder's disk.", disk.total),
    );
  }
  return metrics;
}
