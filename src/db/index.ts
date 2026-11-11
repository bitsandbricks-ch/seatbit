import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { normalizeSeatLayout } from "../lib/seat-layout";

const dbFile = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db");

function create() {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const sqlite = new Database(dbFile);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  withMigrationLock(() => {
    migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    backfillDefaultClan(sqlite);
    normalizeSeatLayout(sqlite);
  });
  return db;
}

/**
 * Several processes can open a fresh database at once (e.g. `next build`
 * workers collecting page data). Without a lock they race on the first
 * migration ("table already exists"). An exclusive transaction on a small lock
 * database makes them take turns; the later ones then find nothing to migrate.
 */
function withMigrationLock(fn: () => void) {
  const lock = new Database(`${dbFile}.migrate-lock`);
  try {
    lock.pragma("busy_timeout = 60000");
    lock.exec("BEGIN EXCLUSIVE");
    try {
      fn();
    } finally {
      lock.exec("COMMIT");
    }
  } finally {
    lock.close();
  }
}

/**
 * Databases from before clans existed: put all LANs, LAN types and users into
 * one clan so nothing is orphaned. Runs only while LANs/types without a clan exist.
 */
function backfillDefaultClan(sqlite: Database.Database) {
  const orphans = sqlite
    .prepare("SELECT (SELECT count(*) FROM lan WHERE clan_id IS NULL) + (SELECT count(*) FROM lan_type WHERE clan_id IS NULL) AS n")
    .get() as { n: number };
  if (!orphans.n) return;
  sqlite.transaction(() => {
    let clan = sqlite.prepare("SELECT id FROM clan ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
    if (!clan) {
      clan = { id: crypto.randomUUID() };
      sqlite.prepare("INSERT INTO clan (id, name, slug) VALUES (?, 'My clan', 'my-clan')").run(clan.id);
      sqlite
        .prepare(
          "INSERT OR IGNORE INTO clan_member (clan_id, user_id, role) SELECT ?, id, CASE WHEN role = 'admin' THEN 'admin' ELSE 'member' END FROM user",
        )
        .run(clan.id);
    }
    sqlite.prepare("UPDATE lan SET clan_id = ? WHERE clan_id IS NULL").run(clan.id);
    sqlite.prepare("UPDATE lan_type SET clan_id = ? WHERE clan_id IS NULL").run(clan.id);
  })();
}

// Reuse one connection across hot reloads in dev.
const g = globalThis as unknown as { __lanDb?: ReturnType<typeof create> };
export const db = g.__lanDb ?? (g.__lanDb = create());
export { schema };
