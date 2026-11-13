#!/usr/bin/env node
/**
 * Re-creates this branch's migration on top of main's migrations.
 *
 *   git merge origin/main      # conflicts in drizzle/ are fine, this resolves them
 *   npm run db:rebase          # or: npm run db:rebase -- <base-ref>
 *
 * Two branches that each add a migration both append to drizzle/meta/_journal.json
 * and both point their snapshot at the same parent, so whoever merges second gets a
 * conflict (and drizzle-kit refuses to run on the colliding snapshots). Instead of
 * fixing that by hand, this takes main's drizzle/ folder, drops the branch's own
 * migrations and lets drizzle-kit generate one fresh migration from the merged
 * schema: it has the right parent and the newest journal `when`.
 *
 * Hand-written SQL (data fix-ups, custom migrations) can't be regenerated. Every
 * statement of the old migration that the new one lacks is printed so you can add
 * it back; a migration that was only custom SQL is re-created as a custom one.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] ?? "origin/main";
const DIR = "drizzle";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" });

let mainJournal;
try {
  mainJournal = JSON.parse(git("show", `${base}:${DIR}/meta/_journal.json`));
} catch {
  console.error(`Can't read ${DIR}/meta/_journal.json on ${base}. Run "git fetch origin main" first, or pass a base ref.`);
  process.exit(1);
}
// drizzle-kit reads the schema, so it must be merged cleanly first.
const unresolved = git("diff", "--name-only", "--diff-filter=U")
  .split("\n")
  .filter((f) => f && !f.startsWith(`${DIR}/`));
if (unresolved.length) {
  console.error(`Resolve these conflicts first (drizzle/ is fine, this script handles it):\n  ${unresolved.join("\n  ")}`);
  process.exit(1);
}
const onMain = new Set(mainJournal.entries.map((e) => e.tag));
const own = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice(0, -4))
  .filter((tag) => !onMain.has(tag))
  .sort();

if (!own.length) {
  console.log(`No migrations on this branch that ${base} doesn't have. Nothing to do.`);
  process.exit(0);
}

const statements = (sql) =>
  sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
const norm = (s) => s.replace(/\s+/g, " ").trim();
const oldSql = own.map((tag) => fs.readFileSync(path.join(DIR, `${tag}.sql`), "utf8"));
const oldStatements = oldSql.flatMap(statements);
// "0036_seat_notes" or "20261113153000_seat_notes" -> "seat_notes"
const name = own[own.length - 1].replace(/^\d+_/, "");

// Main's migrations win wherever both sides have the same file (this also clears
// conflict markers in the journal); then drop ours.
git("checkout", base, "--", DIR);
for (const tag of own) {
  fs.rmSync(path.join(DIR, `${tag}.sql`), { force: true });
  fs.rmSync(path.join(DIR, "meta", `${tag.split("_")[0]}_snapshot.json`), { force: true });
}
// Leave the index matching the working tree, so a merge in progress sees drizzle/ as resolved.
git("add", "-A", "--", DIR);

const before = new Set(fs.readdirSync(DIR));
const kit = (...args) => execFileSync("npx", ["drizzle-kit", "generate", ...args], { stdio: "inherit" });
kit("--name", name);
let created = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !before.has(f));

if (!created.length) {
  // Only hand-written SQL: re-create it as a custom migration.
  kit("--custom", "--name", name);
  created = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !before.has(f));
  fs.writeFileSync(path.join(DIR, created[0]), oldSql.join("\n--> statement-breakpoint\n"));
  console.log(`\nRe-created ${created[0]} as a custom migration with the old SQL.`);
} else {
  const fresh = new Set(statements(fs.readFileSync(path.join(DIR, created[0]), "utf8")).map(norm));
  const missing = oldStatements.filter((s) => !fresh.has(norm(s)));
  console.log(`\nReplaced ${own.join(", ")} with ${created[0]}.`);
  if (missing.length) {
    console.log("\nThese statements were in the old migration but drizzle-kit didn't generate them.");
    console.log(`If they were hand-written (data fix-ups), add them back to ${DIR}/${created[0]}:\n`);
    for (const s of missing) console.log(`${s}\n--> statement-breakpoint`);
  }
}
git("add", "-A", "--", DIR);
console.log("\nCheck the new migration, then run `npm run build` to apply all migrations to a fresh database.");
