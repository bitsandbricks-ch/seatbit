/**
 * Restore and test database backups from the command line. In the container image:
 *
 *   node scripts/restore.mjs list [--s3]               backups in BACKUP_DIR (or the off-site copies in the bucket), newest first
 *   node scripts/restore.mjs verify [backup]           test a backup (default: the newest) without changing anything
 *   node scripts/restore.mjs restore <backup> --yes    put a backup in place of the database
 *   node scripts/restore.mjs fetch [name|latest]       download an off-site copy, decrypt it, test it and save it to BACKUP_DIR
 *   node scripts/restore.mjs keygen                    make a key pair for encrypted off-site copies
 *
 * <backup> is a file name from the list, a path, "latest", or an off-site copy as "s3:latest" or
 * "s3:seatbit-YYYYMMDD-HHMMSS.db.age". Encrypted copies (s3:… and local *.age files) need the
 * private key: --key <file> (an age key file), or BACKUP_PRIVATE_KEY / BACKUP_PRIVATE_KEY_FILE.
 * The bucket comes from BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION, BACKUP_S3_PREFIX,
 * BACKUP_S3_ACCESS_KEY and BACKUP_S3_SECRET_KEY (this script doesn't read the admin settings: in a
 * real loss the database with them is gone).
 *
 * `restore` needs Seatbit to be stopped. It tests the backup first, saves the current database as
 * BACKUP_DIR/pre-restore-YYYYMMDD-HHMMSS.db, then copies the backup over DATABASE_PATH and
 * removes the WAL files. Migrations of the running version apply on the next start.
 *
 * `verify` checks the file (integrity_check, foreign_key_check), how many migrations it is
 * behind this version, and compares its row counts with the live database. The app runs a
 * fuller test (with the migrations applied) after every backup: Admin → Backups.
 */
import Database from "better-sqlite3";
import { Decrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { AwsClient } from "aws4fetch";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "lan.db");
const dir = process.env.BACKUP_DIR ?? path.join(process.cwd(), "backups");
const NAME = /^seatbit-\d{8}-\d{6}\.db$/;
const REMOTE = /^seatbit-(\d{8})-(\d{6})\.db\.age$/;

const [cmd, ...rest] = process.argv.slice(2);
// --key takes a value (--key file or --key=file); other flags are switches.
const opts = {};
const args = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === "--key") opts.key = rest[++i];
  else if (a.startsWith("--key=")) opts.key = a.slice(6);
  else if (a.startsWith("--")) opts[a.slice(2)] = true;
  else args.push(a);
}
const flags = new Set(Object.keys(opts).map((k) => `--${k}`));

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

// ---------- Off-site copies (encrypted, in an S3-compatible bucket) ----------

function s3Config() {
  const c = {
    endpoint: (process.env.BACKUP_S3_ENDPOINT ?? "").replace(/\/+$/, ""),
    bucket: process.env.BACKUP_S3_BUCKET ?? "",
    region: process.env.BACKUP_S3_REGION || "us-east-1",
    prefix: process.env.BACKUP_S3_PREFIX ?? "seatbit/",
    accessKey: process.env.BACKUP_S3_ACCESS_KEY ?? "",
    secretKey: process.env.BACKUP_S3_SECRET_KEY ?? "",
  };
  const missing = [
    ["endpoint", "BACKUP_S3_ENDPOINT"],
    ["bucket", "BACKUP_S3_BUCKET"],
    ["accessKey", "BACKUP_S3_ACCESS_KEY"],
    ["secretKey", "BACKUP_S3_SECRET_KEY"],
  ].filter(([k]) => !c[k]);
  if (missing.length) fail(`Set ${missing.map(([, e]) => e).join(", ")} to reach the bucket (the same values as the app)`);
  return c;
}

async function s3(c, url, init = {}) {
  const client = new AwsClient({ accessKeyId: c.accessKey, secretAccessKey: c.secretKey, region: c.region, service: "s3" });
  const res = await client.fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    fail(`S3 ${init.method ?? "GET"} ${url} answered ${res.status} ${/<Code>([^<]+)</.exec(body)?.[1] ?? ""}`);
  }
  return res;
}
const objectUrl = (c, key) => `${c.endpoint}/${encodeURIComponent(c.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Encrypted copies in the bucket, newest first. */
async function remoteBackups(c) {
  const out = [];
  let token;
  do {
    const q = new URLSearchParams({ "list-type": "2", prefix: c.prefix });
    if (token) q.set("continuation-token", token);
    const xml = await (await s3(c, `${c.endpoint}/${encodeURIComponent(c.bucket)}?${q}`)).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = unxml(/<Key>([^<]*)<\/Key>/.exec(m[1])?.[1] ?? "");
      const name = key.slice(c.prefix.length);
      const t = REMOTE.exec(name);
      if (!t || name.includes("/")) continue;
      const at = new Date(`${t[1].slice(0, 4)}-${t[1].slice(4, 6)}-${t[1].slice(6)}T${t[2].slice(0, 2)}:${t[2].slice(2, 4)}:${t[2].slice(4)}Z`);
      out.push({ key, name, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] ?? 0), at });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] ?? "") || undefined : undefined;
  } while (token);
  return out.sort((a, b) => b.at - a.at);
}

/** The private key(s) for encrypted copies: --key file, BACKUP_PRIVATE_KEY_FILE or BACKUP_PRIVATE_KEY. */
function decrypter() {
  let text = process.env.BACKUP_PRIVATE_KEY ?? "";
  const file = opts.key ?? process.env.BACKUP_PRIVATE_KEY_FILE;
  if (typeof file === "string" && file) {
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      fail(`Can't read the key file ${file}: ${e.message}`);
    }
  }
  const keys = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^AGE-SECRET-KEY-(PQ-)?1[0-9A-Z]+$/i.test(l));
  if (!keys.length) fail("This backup is encrypted: give the private key with --key <file> (or set BACKUP_PRIVATE_KEY / BACKUP_PRIVATE_KEY_FILE)");
  const d = new Decrypter();
  for (const k of keys) d.addIdentity(k.toUpperCase());
  return d;
}

/** Decrypts a stream of an age file into `target`. */
async function decryptTo(stream, target) {
  let plain;
  try {
    plain = await decrypter().decrypt(stream);
  } catch (e) {
    fail(`Can't decrypt: ${e.message} (wrong private key?)`);
  }
  const tmp = `${target}.partial`;
  try {
    await pipeline(Readable.fromWeb(plain), fs.createWriteStream(tmp));
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    fail(`Decrypting failed: ${e.message} (the file is damaged or cut off)`);
  }
  fs.renameSync(tmp, target);
}

// Decrypted copies in the temp folder, removed when the script ends.
const scratchFiles = [];
// What to call a decrypted scratch file in messages: the backup's own name.
const labels = new Map();
const label = (file) => labels.get(file) ?? path.basename(file);
process.on("exit", () => {
  for (const f of scratchFiles) for (const x of [f, `${f}-wal`, `${f}-shm`, `${f}-journal`]) fs.rmSync(x, { force: true });
});
const scratchPath = () => {
  const p = path.join(os.tmpdir(), `seatbit-decrypted-${crypto.randomUUID()}.db`);
  scratchFiles.push(p);
  return p;
};

/** Picks an off-site copy by name ("latest", "seatbit-….db.age" or "seatbit-….db"). */
async function pickRemote(c, arg) {
  const list = await remoteBackups(c);
  if (!list.length) fail(`No off-site copies in ${c.bucket}/${c.prefix}`);
  if (!arg || arg === "latest") return list[0];
  const want = arg.endsWith(".age") ? arg : `${arg}.age`;
  return list.find((r) => r.name === want) ?? fail(`No off-site copy ${want} in ${c.bucket}/${c.prefix}`);
}

/** Downloads and decrypts an off-site copy to `target`. */
async function download(arg, target) {
  const c = s3Config();
  const r = await pickRemote(c, arg);
  console.log(`[restore] downloading ${r.name} (${fmtSize(r.size)}) from ${c.bucket}/${c.prefix}`);
  const res = await s3(c, objectUrl(c, r.key));
  await decryptTo(res.body, target);
  labels.set(target, `s3:${r.name}`);
  // The time the backup was made, so lists and the restore test sort it right.
  fs.utimesSync(target, r.at, r.at);
  return { remote: r, file: target };
}

/** A path to a plain database file for the given backup: local, a local .age file or an off-site copy. */
async function resolveBackup(arg) {
  if (arg?.startsWith("s3:")) return (await download(arg.slice(3), scratchPath())).file;
  if (!arg || arg === "latest") {
    const newest = backups()[0];
    if (!newest) fail(`No backups in ${dir}`);
    return newest.path;
  }
  for (const p of [arg, path.join(dir, arg)]) {
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    if (!p.endsWith(".age")) return path.resolve(p);
    const out = scratchPath();
    await decryptTo(Readable.toWeb(fs.createReadStream(p)), out);
    labels.set(out, path.basename(p));
    const st = fs.statSync(p);
    fs.utimesSync(out, st.atime, st.mtime);
    return out;
  }
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
      if (integrity !== "ok") fail(`${label(file)}: integrity check failed: ${integrity}`);
      const fk = db.pragma("foreign_key_check");
      if (fk.length) fail(`${label(file)}: ${fk.length} rows point at rows that don't exist (foreign_key_check)`);
      const names = tables(db);
      if (!names.includes("user")) fail(`${label(file)} doesn't look like a Seatbit database (no user table)`);
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
  console.log(`[restore] ${label(file)} (${fmtSize(st.size)}, ${st.mtime.toISOString()}) is OK: ${s.tables} tables, ${s.rows} rows, ${s.users} users`);
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
    if (flags.has("--s3")) {
      const c = s3Config();
      const list = await remoteBackups(c);
      if (!list.length) console.log(`No off-site copies in ${c.bucket}/${c.prefix}`);
      for (const r of list) console.log(`${r.name}  ${fmtSize(r.size).padStart(9)}  ${r.at.toISOString()}`);
      break;
    }
    const list = backups();
    if (!list.length) console.log(`No backups in ${dir}`);
    for (const b of list) console.log(`${b.name}  ${fmtSize(b.stat.size).padStart(9)}  ${b.stat.mtime.toISOString()}`);
    break;
  }
  case "verify": {
    const file = await resolveBackup(args[0]);
    report(file, verify(file));
    break;
  }
  case "fetch": {
    // Into the backup folder under its own name, so `restore <name>` and Admin → Backups see it.
    const c = s3Config();
    const r = await pickRemote(c, args[0]);
    const name = r.name.replace(/\.age$/, "");
    const target = path.join(dir, name);
    if (fs.existsSync(target) && !flags.has("--force")) fail(`${target} already exists; --force replaces it`);
    fs.mkdirSync(dir, { recursive: true });
    const scratch = scratchPath();
    await download(r.name, scratch);
    report(scratch, verify(scratch));
    fs.copyFileSync(scratch, target);
    fs.utimesSync(target, r.at, r.at);
    console.log(`[restore] saved ${target}. Restore it with: node scripts/restore.mjs restore ${name} --yes`);
    break;
  }
  case "keygen": {
    // The same layout as age-keygen, so the age tool reads the file too.
    const key = await generateX25519Identity();
    const pub = await identityToRecipient(key);
    process.stdout.write(`# Seatbit backup key\n# created: ${new Date().toISOString().replace(/\.\d+Z$/, "Z")}\n# public key: ${pub}\n${key}\n`);
    console.error(`[restore] public key: ${pub}\n[restore] set it as BACKUP_PUBLIC_KEY (or in Admin → Backups). Keep the private key above off the server, e.g. in your password manager.`);
    break;
  }
  case "restore": {
    if (!args[0]) fail("Which backup? Give a file name from `list`, a path or latest");
    const file = await resolveBackup(args[0]);
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
    console.log(`[restore] restored ${label(file)} to ${dbPath}. Start Seatbit again.`);
    break;
  }
  default:
    console.log(
      "Usage: node scripts/restore.mjs list [--s3] | verify [backup|latest|s3:latest] | restore <backup|latest|s3:latest> --yes [--force] | fetch [name|latest] | keygen\n" +
        "Encrypted copies (s3:…, *.age) need --key <file> or BACKUP_PRIVATE_KEY.",
    );
    process.exit(cmd && cmd !== "help" ? 1 : 0);
}
