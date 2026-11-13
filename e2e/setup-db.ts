/**
 * Fresh demo database for the end-to-end tests, run by the web server command in
 * playwright.config.ts before `next start`. The demo users get passwords
 * ("seatbit-demo"), so the login test can sign in with email.
 */
import fs from "node:fs";
import path from "node:path";
import { DB_FILE } from "./env";

fs.rmSync(path.dirname(DB_FILE), { recursive: true, force: true });
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
process.env.DATABASE_PATH = DB_FILE;

// Imported after DATABASE_PATH is set: src/db opens the file on import.
import("../scripts/seed-demo").then(async ({ seedDemo }) => {
  await seedDemo();
  console.log(`e2e: demo data in ${DB_FILE}`);
});
