/**
 * Restore and test database backups from the command line. In the container image:
 *
 *   node scripts/restore.mjs list                     backups in BACKUP_DIR, newest first
 *   node scripts/restore.mjs verify [backup]          test a backup (default: the newest) without changing anything
 *   node scripts/restore.mjs restore <backup> --yes   put a backup in place of the database
 *
 * <backup> is a file name from the list, a path, or "latest". `restore` needs Seatbit to be
 * stopped. It tests the backup first, saves the current database as
 * BACKUP_DIR/pre-restore-YYYYMMDD-HHMMSS.db, then copies the backup over DATABASE_PATH and
 * removes the WAL files. Migrations of the running version apply on the next start.
 *
 * `verify` checks the file (integrity_check, foreign_key_check), how many migrations it is
 * behind this version, and compares its row counts with the live database. The app runs a
 * fuller test (with the migrations applied) after every backup: Admin → Backups.
 */
import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db");
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const NAME = /^seatbit-\d{8}-\d{6}\.db$/;

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const args = rest.filter((a) => !a.startsWith("--"));

const fail = (msg) => {
  console.error(`[restore] ${msg}`);
  process.exit(1);
};
const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.ceil(n / 1e3)} kB`);
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

function backups() {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => NAME.test(n));
  } catch {}
  return names
    .map((name) => ({ name, path: path.join(dir, name), stat: fs.statSync(path.join(dir, name)) }))
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
}

function resolveBackup(arg) {
  if (!arg || arg === "latest") {
    const newest = backups()[0];
    if (!newest) fail(`No backups in ${dir}`);
    return newest.path;
  }
  for (const p of [arg, path.join(dir, arg)]) if (fs.existsSync(p) && fs.statSync(p).isFile()) return path.resolve(p);
  fail(`No backup ${arg} (looked in the current folder and ${dir})`);
}

const tables = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name")
    .all()
    .map((r) => r.name);
const rowCount = (db, names) => names.reduce((n, t) => n + db.prepare(`SELECT count(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n, 0);
const migrations = (db) => {
  try {
    return db.prepare('SELECT count(*) AS n FROM "__drizzle_migrations"').get().n;
  } catch {
    return 0;
  }
};
/** Migrations this version ships (drizzle/meta/_journal.json), or null outside the app folder. */
function shippedMigrations() {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8")).entries.length;
  } catch {
    return null;
  }
}

/** Tests a backup on a scratch copy, so not even SQLite's journal touches the original. Returns a summary or exits. */
function verify(file) {
  const scratch = path.join(os.tmpdir(), `seatbit-verify-${crypto.randomUUID()}.db`);
  fs.copyFileSync(file, scratch);
  try {
    const db = new Database(scratch);
    try {
      const integrity = db.pragma("integrity_check", { simple: true });
      if (integrity !== "ok") fail(`${path.basename(file)}: integrity check failed: ${integrity}`);
      const fk = db.pragma("foreign_key_check");
      if (fk.length) fail(`${path.basename(file)}: ${fk.length} rows point at rows that don't exist (foreign_key_check)`);
      const names = tables(db);
      if (!names.includes("user")) fail(`${path.basename(file)} doesn't look like a Seatbit database (no user table)`);
      const summary = { tables: names.length, rows: rowCount(db, names), users: db.prepare('SELECT count(*) AS n FROM "user"').get().n, migrations: migrations(db) };
      return summary;
    } finally {
      db.close();
    }
  } finally {
    for (const f of [scratch, `${scratch}-wal`, `${scratch}-shm`, `${scratch}-journal`]) fs.rmSync(f, { force: true });
  }
}

function report(file, s) {
  const st = fs.statSync(file);
  console.log(`[restore] ${path.basename(file)} (${fmtSize(st.size)}, ${st.mtime.toISOString()}) is OK: ${s.tables} tables, ${s.rows} rows, ${s.users} users`);
  const shipped = shippedMigrations();
  if (shipped !== null && s.migrations < shipped) console.log(`[restore] it is ${shipped - s.migrations} migration(s) behind this version; they run on the next start`);
  if (shipped !== null && s.migrations > shipped) console.log(`[restore] warning: it comes from a NEWER version (${s.migrations} migrations, this one has ${shipped}); run that version after restoring`);
  if (fs.existsSync(dbPath)) {
    try {
      const live = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const names = tables(live);
        console.log(`[restore] live database ${dbPath}: ${names.length} tables, ${rowCount(live, names)} rows`);
      } finally {
        live.close();
      }
    } catch (e) {
      console.log(`[restore] couldn't read the live database ${dbPath}: ${e.message}`);
    }
  }
}

/** True when another process has the database open (Seatbit still running). */
function inUse() {
  if (!fs.existsSync(dbPath)) return false;
  const db = new Database(dbPath, { fileMustExist: true });
  try {
    db.pragma("busy_timeout = 0");
    // A running Seatbit keeps the WAL open; while it does, SQLite refuses to leave WAL mode.
    const mode = db.pragma("journal_mode = DELETE", { simple: true });
    return mode !== "delete";
  } catch {
    return true;
  } finally {
    db.close();
  }
}

switch (cmd) {
  case "list": {
    const list = backups();
    if (!list.length) console.log(`No backups in ${dir}`);
    for (const b of list) console.log(`${b.name}  ${fmtSize(b.stat.size).padStart(9)}  ${b.stat.mtime.toISOString()}`);
    break;
  }
  case "verify": {
    const file = resolveBackup(args[0]);
    report(file, verify(file));
    break;
  }
  case "restore": {
    if (!args[0]) fail("Which backup? Give a file name from `list`, a path or latest");
    const file = resolveBackup(args[0]);
    const summary = verify(file);
    report(file, summary);
    if (!flags.has("--yes")) {
      console.log(`[restore] this replaces ${dbPath}. Stop Seatbit, then run again with --yes`);
      process.exit(2);
    }
    if (!flags.has("--force") && inUse()) fail(`${dbPath} is in use: stop Seatbit first (scale to 0 / stop the container). --force skips this check`);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    if (fs.existsSync(dbPath)) {
      // A consistent copy of what is there now (includes the WAL), in case the restore was a mistake.
      fs.mkdirSync(dir, { recursive: true });
      const safety = path.join(dir, `pre-restore-${stamp()}.db`);
      const cur = new Database(dbPath, { fileMustExist: true });
      await cur.backup(safety);
      cur.close();
      console.log(`[restore] saved the current database as ${safety}`);
    }
    // Copy next to the target, then rename: never a half-written database file.
    const tmp = `${dbPath}.restoring`;
    fs.copyFileSync(file, tmp);
    for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
    fs.renameSync(tmp, dbPath);
    console.log(`[restore] restored ${path.basename(file)} to ${dbPath}. Start Seatbit again.`);
    break;
  }
  default:
    console.log("Usage: node scripts/restore.mjs list | verify [backup|latest] | restore <backup|latest> --yes [--force]");
    process.exit(cmd && cmd !== "help" ? 1 : 0);
}
