/**
 * Mail rendering without server imports, so the admin editor can preview in the browser.
 *
 * Every Seatbit mail has the same structure (the layout Hubra uses):
 *   header   logo + clan name
 *   card     "Hi {firstName}," as the title
 *            text        paragraphs, editable
 *            facts box   label / value rows (event, when, seat, …), fixed per template
 *            button      label editable, goes to {link}
 *            note        small grey line, editable
 *   footer   why you get this, link to your mail settings, "sent with seatbit"
 * Each mail goes out as HTML with a plain-text part. The same content also comes as a
 * Discord DM text: no greeting or footer, the button as a link.
 */

export type Vars = Record<string, string | null | undefined>;
export type FactRow = readonly [label: string, value: string, mono?: boolean];

export interface TemplateParts {
  subject: string;
  body: string;
  button: string;
  note: string;
}

/**
 * Fills in {placeholders}. Unknown placeholders stay as written, so a typo is visible.
 * Lines whose placeholders all came out empty are dropped.
 */
export function fill(text: string, vars: Vars) {
  const lines = text.split("\n").flatMap((line) => {
    const names = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => n in vars);
    if (names.length && names.every((n) => !vars[n]?.trim())) return [];
    return [line.replace(/\{(\w+)\}/g, (m, n: string) => (n in vars ? (vars[n] ?? "") : m))];
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------- Look (Seatbit brand: light card, dark mode for clients that support it) ----------

const C = {
  page: "#f4f4f5",
  card: "#ffffff",
  line: "#e4e4e7",
  fg: "#0b0b0f",
  muted: "#52525b",
  tint: "#ecfdf5",
  link: "#047857", // bit-ink: green text on light
  bit: "#2EE59D",
  onBit: "#0B0B0F",
  bitDeep: "#0E9F6E",
};
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const linkify = (s: string) =>
  esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" style="color: ${C.link}; word-break: break-all;">${u}</a>`);

const para = (html: string, small = false) =>
  `<p style="margin: 0 0 16px; font-family: ${FONT}; font-size: ${small ? "13px" : "15px"}; line-height: ${small ? "20px" : "24px"}; color: ${small ? C.muted : C.fg};">${html}</p>`;

function factsBox(rows: FactRow[]) {
  if (!rows.length) return "";
  const tr = rows
    .map(([label, value, mono]) => {
      const v = /^https?:\/\//.test(value) ? linkify(value) : esc(value);
      return `<tr>
        <td valign="top" style="padding: 8px 16px 8px 0; font-family: ${FONT}; font-size: 13px; line-height: 20px; color: ${C.muted}; white-space: nowrap; width: 1%;">${esc(label)}</td>
        <td valign="top" style="padding: 8px 0; font-family: ${mono ? MONO : FONT}; font-size: ${mono ? "14px" : "15px"}; line-height: 20px; font-weight: 600; color: ${C.fg}; overflow-wrap: anywhere;">${v}</td>
      </tr>`;
    })
    .join("");
  return `<table class="sb-facts" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.tint}" style="margin: 0 0 20px; background: ${C.tint}; border-radius: 12px;">
  <tr><td style="padding: 8px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${tr}</table></td></tr>
</table>`;
}

function buttonHtml(url: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 8px 0 24px;">
  <tr><td class="sb-button" align="center" bgcolor="${C.bit}" style="border-radius: 10px; background: ${C.bit};">
    <a href="${esc(url)}" target="_blank" style="display: inline-block; padding: 13px 24px; font-family: ${FONT}; font-size: 15px; font-weight: 700; line-height: 20px; color: ${C.onBit}; text-decoration: none; border-radius: 10px;">${esc(label)}</a>
  </td></tr>
</table>
${para(`If the button doesn't work, open this link:<br /><a href="${esc(url)}" target="_blank" style="color: ${C.link}; word-break: break-all;">${esc(url)}</a>`, true)}`;
}

export interface MailContent {
  subject: string;
  greeting: string;
  body: string;
  facts: FactRow[];
  button?: { label: string; url: string };
  note?: string;
  /** Name in the header: the clan, or Seatbit. */
  header: string;
  /** Absolute URLs for the logo, the mail settings page and the legal pages. */
  logoUrl: string;
  settingsUrl: string;
  termsUrl: string;
  privacyUrl: string;
}

export function renderMail(m: MailContent): { html: string; text: string; dm: string } {
  const paragraphs = m.body.split(/\n{2,}/).filter((p) => p.trim());
  const preheader = (paragraphs[0] ?? "").replace(/\s+/g, " ").slice(0, 140);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${esc(m.subject)}</title>
  <style>
    a { color: ${C.link}; }
    @media (max-width: 600px) {
      .sb-card { padding: 28px 22px !important; }
      .sb-outer { padding: 20px 12px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .sb-page { background: #0B0B0F !important; }
      .sb-card { background: #16161D !important; border-color: #2A2A35 !important; }
      .sb-card p, .sb-card td, .sb-title, .sb-head { color: #F4F4F5 !important; }
      .sb-card a { color: #2EE59D !important; }
      .sb-facts { background: #1F1F28 !important; }
      .sb-button a { color: #0B0B0F !important; }
      .sb-foot, .sb-foot td, .sb-foot a { color: #A1A1AA !important; }
      .sb-word { color: #F4F4F5 !important; }
    }
  </style>
</head>
<body class="sb-page" style="margin: 0; padding: 0; background: ${C.page}; -webkit-text-size-adjust: 100%;">
  <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; mso-hide: all;">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
  <table class="sb-page" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background: ${C.page};">
    <tr><td class="sb-outer" align="center" style="padding: 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px;">
        <tr><td style="padding: 0 4px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td valign="middle" style="padding-right: 12px;"><img src="${esc(m.logoUrl)}" width="40" height="40" alt="" style="display: block; width: 40px; height: 40px; border: 0; border-radius: 9px;" /></td>
            <td valign="middle" class="sb-head" style="font-family: ${FONT}; font-size: 19px; font-weight: 800; line-height: 24px; letter-spacing: -0.2px; color: ${C.fg};">${esc(m.header)}</td>
          </tr></table>
        </td></tr>
        <tr><td class="sb-card" bgcolor="${C.card}" style="background: ${C.card}; border: 1px solid ${C.line}; border-radius: 16px; padding: 36px 36px 20px;">
          <h1 class="sb-title" style="margin: 0 0 18px; font-family: ${FONT}; font-size: 22px; font-weight: 700; line-height: 28px; letter-spacing: -0.3px; color: ${C.fg};">${esc(m.greeting)}</h1>
          ${paragraphs.map((p) => para(linkify(p).replace(/\n/g, "<br />"))).join("\n")}
          ${factsBox(m.facts)}
          ${m.button ? buttonHtml(m.button.url, m.button.label) : ""}
          ${m.note ? para(linkify(m.note).replace(/\n/g, "<br />"), true) : ""}
        </td></tr>
        <tr><td class="sb-foot" align="center" style="padding: 22px 16px 0; font-family: ${FONT}; font-size: 12px; line-height: 18px; color: ${C.muted};">
          Sent to you for ${esc(m.header)} on Seatbit.<br />
          <a href="${esc(m.settingsUrl)}" style="color: ${C.muted}; text-decoration: underline;">Email settings</a>
          &nbsp;&middot;&nbsp; <a href="${esc(m.privacyUrl)}" style="color: ${C.muted}; text-decoration: underline;">Privacy</a>
          &nbsp;&middot;&nbsp; <a href="${esc(m.termsUrl)}" style="color: ${C.muted}; text-decoration: underline;">Terms</a><br />
          Sent with <span class="sb-word" style="font-weight: 800; letter-spacing: -0.2px; color: ${C.fg};">seat</span><span style="font-weight: 800; letter-spacing: -0.2px; color: ${C.bitDeep};">bit</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    m.greeting,
    m.body,
    m.facts.map(([l, v]) => `${l}: ${v}`).join("\n"),
    m.button ? `${m.button.label}: ${m.button.url}` : "",
    m.note ?? "",
    `--\nSent with Seatbit. Email settings: ${m.settingsUrl}\nPrivacy: ${m.privacyUrl}\nTerms: ${m.termsUrl}`,
  ]
    .filter((s) => s.trim())
    .join("\n\n");

  // Discord markdown: facts in bold, the button as a link (the DM also gets a button).
  const dm = [
    m.body,
    m.facts.map(([l, v]) => `**${l}:** ${v}`).join("\n"),
    m.button ? `[${m.button.label.replace(/[[\]]/g, "")}](${m.button.url})` : "",
    m.note ? `-# ${m.note.replace(/\n+/g, " ")}` : "",
  ]
    .filter((s) => s.trim())
    .join("\n\n");
  return { html, text, dm };
}

/** Fills a template's parts and facts and renders the mail. */
export function buildMail(
  t: TemplateParts,
  facts: readonly FactRow[],
  vars: Vars,
  ctx: { appUrl: string },
): { subject: string; html: string; text: string; dm: string } {
  const subject = fill(t.subject, vars).replace(/\s*\n\s*/g, " ");
  const filledFacts = facts
    .map(([l, v, mono]) => [l, fill(v, vars), mono] as FactRow)
    .filter(([, v]) => v.trim());
  const label = fill(t.button, vars);
  const link = vars.link?.trim();
  const { html, text, dm } = renderMail({
    subject,
    greeting: vars.firstName?.trim() ? `Hi ${vars.firstName.trim()},` : "Hi,",
    body: fill(t.body, vars),
    facts: filledFacts,
    button: link && label ? { label, url: link } : undefined,
    note: fill(t.note, vars),
    header: vars.clan?.trim() || "Seatbit",
    logoUrl: `${ctx.appUrl}/brand/icon-192.png`,
    settingsUrl: `${ctx.appUrl}/profile`,
    termsUrl: `${ctx.appUrl}/terms`,
    privacyUrl: `${ctx.appUrl}/privacy`,
  });
  return { subject, html, text, dm };
}

/** Example values for the admin preview. */
export const PREVIEW_VARS: Record<string, string> = {
  firstName: "Anna",
  lan: "Lock&Load 2027",
  start: "12 Mar 2027, 18:00",
  location: "Forum Fribourg",
  link: "https://seatbit.ch/lans/…",
  deadline: "1 Feb 2027, 23:59",
  price: "CHF 65",
  ticketUrl: "https://lal.gg/tickets",
  seat: "F7",
  seatInfo: "You're sitting at F7.",
  clan: "The dark lizzards gizzards wizzards",
  inviter: "Mike",
  events: "Lock&Load 2027 (12 Mar 2027)",
  reason: "The venue moved the date and most of us can't make the new one.",
  news: "Doors open at 10:00. Bring an extension cord, there are only 2 sockets per seat.",
  author: "Mike",
};
