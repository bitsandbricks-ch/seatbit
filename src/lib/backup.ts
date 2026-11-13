/**
 * Database backups: consistent copies of the SQLite file, made while Seatbit runs
 * (SQLite's online backup API), into the backup folder from the platform settings.
 * The built-in scheduler (src/instrumentation.ts) calls runScheduledBackup() every
 * minute; it only backs up when the newest backup is older than the interval, so a
 * restart doesn't add an extra one. Admins list, download and start backups at
 * /admin/backups.
 *
 * Same file names as scripts/backup.mjs, so backups from a cron job show up here too.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { db } from "../db";
import { getNumberSetting, getSetting } from "./settings";
import { runJob } from "./jobs";
import { reportError } from "./ops";

const NAME = /^seatbit-\d{8}-\d{6}\.db$/;

export type BackupFile = { name: string; size: number; at: Date };
export type BackupStatus = {
  running: boolean;
  lastOk?: { name: string; at: Date; ms: number };
  lastError?: { message: string; at: Date };
};

// Shared across module instances (instrumentation, server actions, route handlers).
const g = globalThis as unknown as { __seatbitBackup?: BackupStatus & { job?: Promise<BackupFile> } };
const state = () => (g.__seatbitBackup ??= { running: false });

export function backupDir() {
  // Relative paths from the working directory. The comment keeps Next.js from tracing the whole project into the build.
  return path.resolve(/* turbopackIgnore: true */ getSetting("backup.dir") || "backups");
}

export const backupIntervalHours = () => getNumberSetting("backup.intervalHours") ?? 24;
export const backupKeepDays = () => getNumberSetting("backup.keepDays") ?? 14;

export function backupStatus(): BackupStatus {
  const { running, lastOk, lastError } = state();
  return { running, lastOk, lastError };
}

/** Backups in the folder, newest first. Empty when the folder doesn't exist yet. */
export function listBackups(): BackupFile[] {
  const dir = backupDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => NAME.test(n))
    .flatMap((name) => {
      try {
        const s = fs.statSync(path.join(dir, name));
        return [{ name, size: s.size, at: s.mtime }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Full path of a backup, or null when the name isn't one of ours (no path tricks). */
export function backupPath(name: string): string | null {
  if (!NAME.test(name)) return null;
  const p = path.join(backupDir(), name);
  return fs.existsSync(p) ? p : null;
}

/** Free and total bytes on the backup folder's disk, when the platform can tell. */
export function backupDisk(): { free: number; total: number } | null {
  try {
    const s = fs.statfsSync(backupDir());
    return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return null;
  }
}

/** Size of the live database file (without the WAL). */
export function databaseSize(): number | null {
  try {
    return fs.statSync(db.$client.name).size;
  } catch {
    return null;
  }
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/**
 * Writes a new backup and prunes old ones. Only one runs at a time: a second call
 * while one is running waits for it and returns the same file.
 */
export function createBackup(): Promise<BackupFile> {
  const s = state();
  if (s.job) return s.job;
  s.running = true;
  const started = Date.now();
  // runJob: shows on the Health page; reportError: the ops Discord channel (deduped).
  s.job = runJob("backup", async () => {
    const dir = backupDir();
    fs.mkdirSync(dir, { recursive: true });
    let name = `seatbit-${stamp(new Date())}.db`;
    // Two backups in the same second (button pressed right after the schedule): add a second.
    for (let i = 1; fs.existsSync(path.join(dir, name)); i++) name = `seatbit-${stamp(new Date(Date.now() + i * 1000))}.db`;
    const target = path.join(dir, name);
    // Written under a name the list ignores, renamed once complete and checked.
    const tmp = `${target}.partial`;
    try {
      await db.$client.backup(tmp);
      // The copy inherits WAL mode; switch it to a plain single file, so no -wal/-shm files lie around
      // and a restore is just copying one file.
      const check = new Database(tmp);
      let result: unknown;
      try {
        check.pragma("journal_mode = DELETE");
        result = check.pragma("integrity_check", { simple: true });
      } finally {
        check.close();
      }
      if (result !== "ok") throw new Error(`Integrity check failed: ${String(result)}`);
      fs.renameSync(tmp, target);
    } catch (e) {
      for (const f of [tmp, `${tmp}-wal`, `${tmp}-shm`]) fs.rmSync(f, { force: true });
      throw e;
    }
    pruneBackups();
    const st = fs.statSync(target);
    return { name, size: st.size, at: st.mtime };
  })
    .then((f) => {
      s.lastOk = { name: f.name, at: new Date(), ms: Date.now() - started };
      s.lastError = undefined;
      console.log(`[backup] wrote ${f.name} (${f.size} bytes)`);
      return f;
    })
    .catch((e: unknown) => {
      s.lastError = { message: e instanceof Error ? e.message : String(e), at: new Date() };
      console.error("[backup] failed", e);
      reportError("backup", e);
      throw e;
    })
    .finally(() => {
      s.running = false;
      s.job = undefined;
    });
  return s.job;
}

/** Deletes backups older than the retention. The newest one always stays, however old. */
export function pruneBackups(keepDays = backupKeepDays()): string[] {
  if (!keepDays || keepDays <= 0) return [];
  const cutoff = Date.now() - keepDays * 86400_000;
  const [, ...older] = listBackups();
  const removed: string[] = [];
  for (const b of older) {
    if (b.at.getTime() >= cutoff) continue;
    try {
      fs.rmSync(path.join(backupDir(), b.name));
      removed.push(b.name);
    } catch (e) {
      console.error("[backup] could not prune %s", b.name, e);
    }
  }
  if (removed.length) console.log("[backup] pruned", removed);
  return removed;
}

export function deleteBackup(name: string): boolean {
  const p = backupPath(name);
  if (!p) return false;
  fs.rmSync(p);
  return true;
}

/** When the next scheduled backup is due, or null when scheduled backups are off. */
export function nextBackupAt(): Date | null {
  const hours = backupIntervalHours();
  if (!hours || hours <= 0) return null;
  const newest = listBackups()[0];
  if (!newest) return new Date();
  return new Date(newest.at.getTime() + hours * 3600_000);
}

/**
 * Called every minute by the built-in scheduler. Backs up when the newest backup is
 * older than the interval. After a failure it waits an hour before trying again, so a
 * full disk doesn't log an error every minute.
 */
export async function runScheduledBackup() {
  const next = nextBackupAt();
  if (!next || next.getTime() > Date.now()) return;
  const s = state();
  if (s.running) return;
  if (s.lastError && Date.now() - s.lastError.at.getTime() < 3600_000) return;
  await createBackup().catch(() => {});
}
