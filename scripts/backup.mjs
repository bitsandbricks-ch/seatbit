/**
 * Online SQLite backup, safe while the app is running (uses SQLite's backup API).
 * Writes BACKUP_DIR/seatbit-YYYYMMDD-HHMMSS.db and deletes backups older than
 * BACKUP_KEEP_DAYS (default 14). Seatbit makes these backups itself (Admin → Backups);
 * this script is for setups that turn that off and back up from a cron job instead:
 *   node scripts/backup.mjs
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const src = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db");
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const keepDays = Number(process.env.BACKUP_KEEP_DAYS ?? 14);

fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const target = path.join(dir, `seatbit-${stamp}.db`);

const db = new Database(src, { readonly: true, fileMustExist: true });
await db.backup(target);
db.close();

// Sanity check the copy before pruning older ones. The copy inherits WAL mode; make it a
// plain single file, so no -wal/-shm files are left next to it.
const check = new Database(target);
check.pragma("journal_mode = DELETE");
const result = check.pragma("integrity_check", { simple: true });
check.close();
if (result !== "ok") {
  console.error(`[backup] integrity check failed for ${target}: ${result}`);
  process.exit(1);
}
console.log(`[backup] wrote ${target} (${fs.statSync(target).size} bytes)`);

if (keepDays > 0) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(dir)) {
    if (!/^seatbit-\d{8}-\d{6}\.db$/.test(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).mtimeMs < cutoff) {
      fs.rmSync(p);
      console.log(`[backup] pruned ${f}`);
    }
  }
}
