/**
 * Restore drill: proves that a backup can actually be restored, not only that the file exists.
 * Copies the backup to a scratch file in the temp folder and, on that copy:
 *   1. checks it (PRAGMA integrity_check and foreign_key_check),
 *   2. runs this version's migrations on it, as a start after a restore would,
 *   3. compares its tables and row counts with the live database.
 * The backup and the live database are never written to. The result is stored, so the
 * admin Backups page, Health and /api/metrics show it after a restart too.
 *
 * The scheduler (src/instrumentation.ts) tests every new backup, also ones a cron job
 * wrote with scripts/backup.mjs. `node scripts/restore.mjs verify` does steps 1 and 3
 * from the command line, without the app.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "../db";
import { backupPath, listBackups } from "./backup";
import { runJob } from "./jobs";
import { reportError } from "./ops";
import { getBoolSetting, readState, rememberState } from "./settings";

export type DrillResult = {
  name: string;
  /** ISO time the drill ran. */
  at: string;
  /** ISO time the backup was written. */
  backupAt?: string;
  ok: boolean;
  ms: number;
  error?: string;
  tables?: number;
  /** Rows in the restored copy, all tables together. */
  rows?: number;
  /** Rows in the live database when the drill ran. */
  liveRows?: number;
  /** Migrations the copy got during the drill (it came from an older version). */
  migrated?: number;
};

const STATE = "state.backup.drill";
// Don't retry a failed drill of the same file every minute.
const RETRY_MS = 3600_000;

export const drillEnabled = () => getBoolSetting("backup.verify");

export function lastDrill(): DrillResult | null {
  try {
    const raw = readState(STATE);
    return raw ? (JSON.parse(raw) as DrillResult) : null;
  } catch {
    return null;
  }
}

/** Tables of a database, without SQLite's and Drizzle's own. */
function tables(sqlite: Database.Database): string[] {
  return (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all() as { name: string }[]).map(
    (r) => r.name,
  );
}

function rowCounts(sqlite: Database.Database, names: string[]) {
  let total = 0;
  for (const n of names) total += (sqlite.prepare(`SELECT count(*) AS n FROM "${n.replace(/"/g, '""')}"`).get() as { n: number }).n;
  return total;
}

const migrationCount = (sqlite: Database.Database) => {
  try {
    return (sqlite.prepare('SELECT count(*) AS n FROM "__drizzle_migrations"').get() as { n: number }).n;
  } catch {
    return 0;
  }
};

/** Runs the drill on one backup. Throws only for an unknown name; a failed drill is a result with ok: false. */
async function drill(name: string): Promise<DrillResult> {
  const src = backupPath(name);
  if (!src) throw new Error(`No backup named ${name}`);
  const started = Date.now();
  const scratch = path.join(os.tmpdir(), `seatbit-restore-test-${crypto.randomUUID()}.db`);
  const result: DrillResult = { name, at: new Date().toISOString(), ok: false, ms: 0 };
  let copy: Database.Database | undefined;
  try {
    result.backupAt = fs.statSync(src).mtime.toISOString();
    fs.copyFileSync(src, scratch);
    copy = new Database(scratch);
    const integrity = copy.pragma("integrity_check", { simple: true });
    if (integrity !== "ok") throw new Error(`Integrity check failed: ${String(integrity)}`);
    const fk = copy.pragma("foreign_key_check") as unknown[];
    if (fk.length) throw new Error(`${fk.length} rows point at rows that don't exist (foreign_key_check)`);

    const before = migrationCount(copy);
    migrate(drizzle(copy), { migrationsFolder: path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle") });
    result.migrated = migrationCount(copy) - before;

    // After the migrations the copy must have every table the running version has.
    const live = db.$client;
    const liveTables = tables(live);
    const copyTables = new Set(tables(copy));
    const missing = liveTables.filter((t) => !copyTables.has(t));
    if (missing.length) throw new Error(`Tables missing after restore: ${missing.join(", ")}`);
    result.tables = copyTables.size;
    result.rows = rowCounts(copy, [...copyTables]);
    result.liveRows = rowCounts(live, liveTables);
    // A backup with no users while the live database has some restores to an empty instance.
    const users = (copy.prepare('SELECT count(*) AS n FROM "user"').get() as { n: number }).n;
    const liveUsers = (live.prepare('SELECT count(*) AS n FROM "user"').get() as { n: number }).n;
    if (!users && liveUsers) throw new Error("The backup has no users, the live database has some");
    result.ok = true;
  } catch (e) {
    result.error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
  } finally {
    copy?.close();
    for (const f of [scratch, `${scratch}-wal`, `${scratch}-shm`, `${scratch}-journal`]) fs.rmSync(f, { force: true });
  }
  result.ms = Date.now() - started;
  return result;
}

const g = globalThis as unknown as { __seatbitDrill?: { job?: Promise<DrillResult>; failedAt?: Record<string, number> } };
const state = () => (g.__seatbitDrill ??= {});

/** Tests one backup (newest when no name is given), stores and returns the result. One at a time. */
export function testRestore(name = listBackups()[0]?.name): Promise<DrillResult> {
  const s = state();
  if (s.job) return s.job;
  if (!name) return Promise.reject(new Error("No backup to test yet"));
  s.job = runJob("restore-test", async () => {
    const r = await drill(name);
    rememberState(STATE, JSON.stringify(r));
    if (r.ok) {
      console.log(`[backup] restore test of ${r.name} passed (${r.tables} tables, ${r.rows} rows, ${r.ms} ms)`);
      return r;
    }
    (s.failedAt ??= {})[name] = Date.now();
    console.error(`[backup] restore test of ${r.name} failed: ${r.error}`);
    const err = new Error(`Restore test of ${r.name} failed: ${r.error}`);
    reportError("restore-test", err);
    // runJob records the failure for the Health page; the result is still returned below.
    throw Object.assign(err, { result: r });
  })
    .catch((e: unknown) => {
      const r = (e as { result?: DrillResult }).result;
      if (r) return r;
      throw e;
    })
    .finally(() => {
      s.job = undefined;
    });
  return s.job;
}

/**
 * Called every minute by the scheduler: tests the newest backup once, whoever wrote it
 * (the app or a cron job). A failed test is retried after an hour, or when a newer backup comes.
 */
export async function runScheduledDrill() {
  if (!drillEnabled()) return;
  const newest = listBackups()[0];
  if (!newest) return;
  // Leave a file a cron job is still writing alone for a minute.
  if (Date.now() - newest.at.getTime() < 60_000) return;
  const last = lastDrill();
  if (last?.name === newest.name && last.ok) return;
  const failed = state().failedAt?.[newest.name];
  if (failed && Date.now() - failed < RETRY_MS) return;
  if (last?.name === newest.name && !last.ok && !failed && Date.now() - Date.parse(last.at) < RETRY_MS) return;
  await testRestore(newest.name).catch(() => {});
}
