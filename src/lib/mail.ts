import nodemailer, { type Transporter } from "nodemailer";
import { isGuestEmail } from "./guests";
import { recordMail } from "./jobs";
import { reportError } from "./ops";
import { getNumberSetting, getSetting, settingsFingerprint } from "./settings";

export const appUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

const MAIL_KEYS = ["smtp.host", "smtp.port", "smtp.security", "smtp.user", "smtp.password"];

/** Where mail goes: the SMTP settings, else the legacy SMTP_URL env var, else nowhere (console). */
export function mailTarget(): { kind: "smtp"; host: string } | { kind: "url" } | { kind: "console" } {
  const host = getSetting("smtp.host");
  if (host) return { kind: "smtp", host };
  if (process.env.SMTP_URL) return { kind: "url" };
  return { kind: "console" };
}

function createTransport(): Transporter | null {
  const host = getSetting("smtp.host");
  if (!host) return process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;
  const security = getSetting("smtp.security") ?? "starttls";
  const user = getSetting("smtp.user");
  return nodemailer.createTransport({
    host,
    port: getNumberSetting("smtp.port") ?? (security === "tls" ? 465 : 587),
    secure: security === "tls",
    requireTLS: security === "starttls",
    ignoreTLS: security === "none",
    auth: user ? { user, pass: getSetting("smtp.password") ?? "" } : undefined,
  });
}

const g = globalThis as unknown as { __seatbitMail?: { fp: string; transport: Transporter | null } };

/** The SMTP transport for the current settings, rebuilt when they change. */
function transport() {
  const fp = settingsFingerprint(MAIL_KEYS) + (process.env.SMTP_URL ?? "");
  if (g.__seatbitMail?.fp !== fp) {
    g.__seatbitMail?.transport?.close();
    g.__seatbitMail = { fp, transport: createTransport() };
  }
  return g.__seatbitMail.transport;
}

export type RenderedMail = { subject: string; text: string; html: string };

/**
 * Hands a finished mail to SMTP. Don't call this from feature code: send through
 * `sendTemplate` (mail-templates.ts), `sendSystemMail` or `notify`, so every mail
 * gets the shared layout. `npm run check:mail` enforces that.
 * Without an SMTP host (admin settings or env), the mail is logged to the console
 * instead, so local development works without a mail server.
 */
export async function deliverMail(to: string, m: RenderedMail) {
  if (isGuestEmail(to)) return; // guests have no real address
  const t = transport();
  const from = getSetting("mail.from") ?? "Seatbit <noreply@localhost>";
  if (!t) {
    console.log(`\n[mail] (no SMTP configured, not sent)\nTo: ${to}\nSubject: ${m.subject}\n\n${m.text}\n`);
    return;
  }
  try {
    await t.sendMail({ from, to, subject: m.subject, text: m.text, html: m.html });
    recordMail(true);
  } catch (e) {
    recordMail(false, e);
    reportError("mail", e, [{ name: "SMTP", value: getSetting("smtp.host") ?? "SMTP_URL" }], "mail");
    throw e;
  }
}

/** Checks the SMTP connection and login without sending anything. */
export async function verifySmtp() {
  const t = transport();
  if (!t) throw new Error("No SMTP host configured");
  await t.verify();
}
