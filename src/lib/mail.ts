import nodemailer from "nodemailer";

const from = process.env.MAIL_FROM ?? "Seatbit <noreply@localhost>";

const transport = process.env.SMTP_URL
  ? nodemailer.createTransport(process.env.SMTP_URL)
  : null;

export const appUrl = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/**
 * Sends an email. Without SMTP_URL configured, the mail is logged to the
 * console instead, so local development works without a mail server.
 */
export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`\n[mail] (no SMTP_URL set, not sent)\nTo: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  await transport.sendMail({ from, to, subject, text });
}
