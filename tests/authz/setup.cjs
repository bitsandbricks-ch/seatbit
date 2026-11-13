/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS preload, loaded with node --require */
// Preloaded before the authorization tests: a throwaway database, email login for
// the test accounts, and stubs for the Next.js request APIs so server actions run
// in plain Node (the app compiles to CommonJS under tsx, so patching require's
// resolver is enough).
const Module = require("node:module");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");

// Never talk to real services from a test, whatever the developer's .env says.
for (const k of Object.keys(process.env)) if (/^(SMTP|DISCORD|STRIPE|GOOGLE|BACKUP)_/.test(k)) delete process.env[k];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seatbit-authz-"));
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
process.env.DATABASE_PATH = path.join(dir, "authz.db");
process.env.BACKUP_DIR = path.join(dir, "backups");
process.env.ALLOW_EMAIL_LOGIN = "1";
process.env.CRON_SECRET = "test-cron-secret-0123456789"; // tests/authz/matrix.ts uses the same
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.BETTER_AUTH_SECRET = require("node:crypto").randomBytes(32).toString("base64");

const STUBS = {
  "next/headers": "stubs/next-headers.cjs",
  "next/cache": "stubs/next-cache.cjs",
  "server-only": "stubs/empty.cjs",
};

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (STUBS[request]) return path.join(__dirname, STUBS[request]);
  return resolve.call(this, request, ...rest);
};
