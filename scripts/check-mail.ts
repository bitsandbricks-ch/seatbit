/**
 * Makes sure every email goes out in the shared mail layout (src/lib/mail-fill.ts).
 *
 *   npm run check:mail
 *
 * Only the mail helpers may touch SMTP: nodemailer and deliverMail() are allowed in the
 * files below and nowhere else. Feature code sends through sendTemplate() (editable
 * templates), sendSystemMail() (fixed system mails) or notify() (notifications).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const DIRS = ["src", "scripts"];

// Files that may send a rendered mail, and why.
const ALLOWED: Record<string, RegExp[]> = {
  "src/lib/mail.ts": [/nodemailer/, /deliverMail/, /\.sendMail\(/], // the transport itself
  "src/lib/mail-templates.ts": [/deliverMail/], // sendTemplate
  "src/lib/system-mail.ts": [/deliverMail/], // sendSystemMail, renderNotice
  "src/lib/notify.ts": [/deliverMail/], // notify(): templated html, or renderNotice
};

const RULES: { re: RegExp; why: string }[] = [
  { re: /from\s+["']nodemailer["']|require\(\s*["']nodemailer["']\s*\)/, why: "imports nodemailer" },
  { re: /\bdeliverMail\b/, why: "uses deliverMail()" },
  { re: /\.sendMail\(/, why: "calls a transport's sendMail()" },
];

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(e.name) ? [p] : [];
  });
}

const self = path.relative(ROOT, import.meta.filename);
const hits: string[] = [];
for (const file of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (rel === self) continue;
  const allowed = ALLOWED[rel] ?? [];
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const r of RULES) {
        if (r.re.test(line) && !allowed.some((a) => a.test(line))) hits.push(`${rel}:${i + 1}  ${r.why}: ${line.trim()}`);
      }
    });
}

if (hits.length) {
  console.error(
    `Mail sent outside the template helpers (${hits.length}):\n\n${hits.join("\n")}\n\n` +
      "Send mail through sendTemplate(), sendSystemMail() or notify() so it gets the shared layout.\n" +
      "A new system mail goes into SYSTEM_MAILS in src/lib/system-mail.ts with its text in the systemMail messages.",
  );
  process.exit(1);
}
console.log("check:mail: every mail goes through the template helpers.");
