#!/usr/bin/env node
/**
 * Seatbit admin CLI: manage platform admins and recover from bad login settings,
 * straight on the database. Works in the container while the app is running:
 *
 *   kubectl exec deploy/seatbit -- node scripts/admin.mjs list
 *   kubectl exec deploy/seatbit -- node scripts/admin.mjs grant mike@example.com
 *   kubectl exec deploy/seatbit -- node scripts/admin.mjs revoke 123456789012345678
 *   kubectl exec deploy/seatbit -- node scripts/admin.mjs reset-setting discord.clientSecret
 *
 * Locally: npm run admin -- list
 *
 * A user can be given as email, Discord user ID, Seatbit user ID, name or nickname
 * (case-insensitive). Role changes apply on the user's next page load.
 */
import Database from "better-sqlite3";
import path from "node:path";

const dbFile = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db");

const USAGE = `Usage: node scripts/admin.mjs <command>

  list                    List platform admins
  users [search]          List users (optionally filtered)
  grant <user|email>      Make a user a platform admin. If no user matches an
                          email yet, it is added to the admin emails setting,
                          so that person becomes admin on first sign-in.
  revoke <user>           Remove platform admin
  reset-setting <key>     Remove a value saved in Platform settings, so the
                          env var applies again (e.g. discord.clientId,
                          discord.clientSecret if a bad value locks everyone out)

  <user> = email, Discord user ID, Seatbit user ID, name or nickname.
  Database: ${dbFile} (DATABASE_PATH)`;

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const arg = rest.filter((a) => !a.startsWith("--")).join(" ").trim();

function open() {
  try {
    const db = new Database(dbFile, { fileMustExist: true });
    db.pragma("busy_timeout = 5000");
    return db;
  } catch (e) {
    fail(`Can't open the database at ${dbFile}: ${e.message}\nStart the app once so it creates and migrates the database, or set DATABASE_PATH.`);
  }
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const USERS_SQL = `
  SELECT u.id, u.name, u.email, u.role, u.created_at AS createdAt,
         (SELECT a.account_id FROM account a WHERE a.user_id = u.id AND a.provider_id = 'discord' LIMIT 1) AS discordId,
         (SELECT group_concat(DISTINCT n.nick) FROM nickname n WHERE n.user_id = u.id) AS nicks
  FROM user u`;

function allUsers(db) {
  return db.prepare(`${USERS_SQL} ORDER BY u.created_at`).all();
}

/** Users matching an identifier: exact id/email/Discord id first, then name/nickname. */
function findUsers(db, q) {
  const users = allUsers(db);
  const l = q.toLowerCase();
  const exact = users.filter((u) => u.id === q || u.discordId === q || u.email.toLowerCase() === l);
  if (exact.length) return exact;
  return users.filter(
    (u) =>
      u.name.toLowerCase() === l ||
      (u.nicks ?? "")
        .split(",")
        .some((n) => n.toLowerCase() === l),
  );
}

function fmt(u) {
  const nicks = u.nicks ? ` aka ${u.nicks.split(",").join(", ")}` : "";
  const discord = u.discordId ? ` discord:${u.discordId}` : "";
  return `${u.role === "admin" ? "[admin] " : "        "}${u.name || "(no name)"}${nicks} <${u.email}>${discord}  id:${u.id}`;
}

function one(db, q) {
  if (!q) fail(USAGE);
  const found = findUsers(db, q);
  if (found.length === 1) return found[0];
  if (found.length > 1) fail(`"${q}" matches ${found.length} users, use the email or ID instead:\n${found.map(fmt).join("\n")}`);
  return null;
}

function adminEmails(db) {
  const row = db.prepare("SELECT value FROM app_setting WHERE key = 'auth.adminEmails'").get();
  const raw = row ? row.value : (process.env.ADMIN_EMAILS ?? "");
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function saveAdminEmails(db, emails) {
  db.prepare(
    `INSERT INTO app_setting (key, value, encrypted, updated_by, updated_at) VALUES ('auth.adminEmails', ?, 0, NULL, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = NULL, updated_at = excluded.updated_at`,
  ).run(emails.join(", "), Date.now());
}

const db = cmd && cmd !== "help" && cmd !== "--help" && cmd !== "-h" ? open() : null;

switch (cmd) {
  case "list": {
    const admins = allUsers(db).filter((u) => u.role === "admin");
    console.log(admins.length ? admins.map(fmt).join("\n") : "No platform admins yet. The first person to sign in becomes one.");
    const pending = adminEmails(db).filter((e) => !allUsers(db).some((u) => u.email.toLowerCase() === e.toLowerCase()));
    if (pending.length) console.log(`\nBecome admin on first sign-in: ${pending.join(", ")}`);
    break;
  }
  case "users": {
    const l = arg.toLowerCase();
    const users = allUsers(db).filter((u) => !l || fmt(u).toLowerCase().includes(l));
    console.log(users.length ? users.map(fmt).join("\n") : "No users found.");
    break;
  }
  case "grant": {
    const u = one(db, arg);
    if (u) {
      if (u.role === "admin") console.log(`${u.name} is already a platform admin.`);
      else {
        db.prepare("UPDATE user SET role = 'admin', updated_at = ? WHERE id = ?").run(Date.now(), u.id);
        console.log(`${u.name} <${u.email}> is now a platform admin.`);
      }
    } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(arg)) {
      const emails = adminEmails(db);
      if (!emails.some((e) => e.toLowerCase() === arg.toLowerCase())) saveAdminEmails(db, [...emails, arg]);
      console.log(`No user with ${arg} yet. They'll become a platform admin when they first sign in with Discord (the email must match their Discord account's email).`);
    } else {
      fail(`No user matches "${arg}". Try: node scripts/admin.mjs users ${arg}`);
    }
    break;
  }
  case "revoke": {
    const u = one(db, arg);
    if (!u) fail(`No user matches "${arg}". Try: node scripts/admin.mjs users`);
    if (u.role !== "admin") console.log(`${u.name} is not a platform admin.`);
    else {
      const others = allUsers(db).filter((x) => x.role === "admin" && x.id !== u.id).length;
      if (!others && !flags.includes("--force")) fail(`${u.name} is the last platform admin. Add --force to remove anyway.`);
      db.prepare("UPDATE user SET role = 'member', updated_at = ? WHERE id = ?").run(Date.now(), u.id);
      console.log(`${u.name} <${u.email}> is no longer a platform admin.`);
    }
    const emails = adminEmails(db);
    const kept = emails.filter((e) => e.toLowerCase() !== u.email.toLowerCase());
    if (kept.length !== emails.length) {
      saveAdminEmails(db, kept);
      console.log(`Also removed ${u.email} from the admin emails setting.`);
    }
    break;
  }
  case "reset-setting": {
    if (!arg) fail(USAGE);
    const r = db.prepare("DELETE FROM app_setting WHERE key = ?").run(arg);
    console.log(r.changes ? `Removed the saved value of ${arg}; the env var / default applies within a few seconds.` : `${arg} has no saved value.`);
    break;
  }
  default:
    console.log(USAGE);
    if (cmd && !["help", "--help", "-h"].includes(cmd)) process.exit(1);
}
db?.close();
