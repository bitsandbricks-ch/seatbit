/**
 * Fixed mails: system and admin mails whose text lives in the translation files
 * instead of the admin template editor (test mail, password reset, platform notices).
 * They use the same layout as the editable templates (mail-fill.ts), in the
 * recipient's language. Admins see them read-only at /admin/settings?tab=templates.
 */
import type { Locale } from "../i18n/config";
import { makeT, type MessageKey, type T } from "../i18n/translate";
import { appUrl, deliverMail } from "./mail";
import { type FactRow, layoutLinks, renderMail } from "./mail-fill";

type Link = { label: string; url: string };
type Built = { subject: string; body: string; facts?: FactRow[]; button?: Link; links?: Link[]; note?: string };
type Vars = Record<string, string>;

/** Each fixed mail: its example values and how to fill it in. */
const SYSTEM_MAILS = {
  smtpTest: {
    example: (): Vars => ({ firstName: "Anna", host: "smtp.example.com" }),
    build: (t: T, v: Vars): Built => ({
      subject: t("systemMail.smtpTest.subject"),
      body: t("systemMail.smtpTest.body", { url: appUrl }),
      facts: [
        [t("systemMail.fact.server"), v.host ?? ""],
        [t("systemMail.fact.instance"), appUrl],
      ],
      button: { label: t("systemMail.smtpTest.button"), url: `${appUrl}/admin/settings?tab=mail` },
      note: t("systemMail.smtpTest.note"),
    }),
  },
  passwordReset: {
    example: (): Vars => ({ firstName: "Anna", link: `${appUrl}/reset-password?token=…` }),
    build: (t: T, v: Vars): Built => ({
      subject: t("systemMail.passwordReset.subject"),
      body: t("systemMail.passwordReset.body"),
      button: { label: t("systemMail.passwordReset.button"), url: v.link ?? appUrl },
      note: t("systemMail.passwordReset.note"),
    }),
  },
} satisfies Record<string, { example: () => Vars; build: (t: T, v: Vars) => Built }>;

export type SystemMailId = keyof typeof SYSTEM_MAILS;
export const SYSTEM_MAIL_IDS = Object.keys(SYSTEM_MAILS) as SystemMailId[];

function layout(b: Built, firstName: string | undefined, t: T) {
  const { html, text } = renderMail({
    subject: b.subject,
    greeting: firstName?.trim() ? t("mail.hi", { name: firstName.trim() }) : t("mail.hiAnon"),
    body: b.body,
    facts: (b.facts ?? []).filter(([, v]) => v.trim()),
    button: b.button,
    links: b.links,
    note: b.note,
    header: "Seatbit",
    ...layoutLinks(appUrl),
    locale: t.locale,
  });
  return { subject: b.subject, html, text };
}

/** Subject, HTML and plain text of a fixed mail in a language. */
export function renderSystemMail(id: SystemMailId, vars: Vars, loc: Locale) {
  const t = makeT(loc);
  return layout(SYSTEM_MAILS[id].build(t, vars), vars.firstName, t);
}


/** Renders a fixed mail and sends it. */
export async function sendSystemMail(to: string, id: SystemMailId, vars: Vars, loc: Locale) {
  await deliverMail(to, renderSystemMail(id, vars, loc));
}

/** Every fixed mail the admin page lists: the system mails and the generic notice layout. */
export const FIXED_MAIL_IDS: FixedMailId[] = [...SYSTEM_MAIL_IDS, "notice"];
export type FixedMailId = SystemMailId | "notice";

/** A fixed mail filled with example values, for the admin preview. */
export function previewFixedMail(id: FixedMailId, loc: Locale) {
  return id === "notice" ? previewNotice(loc) : renderSystemMail(id, SYSTEM_MAILS[id].example(), loc);
}

/** Sends the example version of a fixed mail to an admin. */
export async function sendFixedMailTest(to: string, id: FixedMailId, firstName: string, loc: Locale) {
  const m = id === "notice" ? previewNotice(loc, firstName) : renderSystemMail(id, { ...SYSTEM_MAILS[id].example(), firstName }, loc);
  await deliverMail(to, { ...m, subject: `[Test] ${m.subject}` });
}

/** Title and "when it goes out" line of a fixed mail, for the admin list. */
export const fixedMailInfo = (id: FixedMailId, t: T) => ({
  title: t(`systemMail.${id}.title` as MessageKey),
  when: t(`systemMail.${id}.when` as MessageKey),
});

/**
 * A notification (notify.ts) as a mail in the shared layout: the notice text as the
 * body, its link as the "Open in Seatbit" button. Notices written as plain text
 * (clan requests, upgrades, seat swaps, …) go out this way.
 */
export function renderNotice(
  n: { subject: string; body: string; url?: string; urlLabel?: string; links?: Link[]; firstName?: string },
  loc: Locale,
) {
  const t = makeT(loc);
  return layout(
    {
      subject: n.subject,
      body: n.body,
      button: n.url ? { label: n.urlLabel ?? t("notice.openInSeatbit"), url: n.url } : undefined,
      links: n.links,
    },
    n.firstName,
    t,
  );
}

/** The generic notice with example values, for the admin preview. */
export function previewNotice(loc: Locale, firstName = "Anna") {
  const t = makeT(loc);
  return renderNotice(
    {
      subject: t("systemMail.notice.exampleSubject"),
      body: t("systemMail.notice.exampleBody"),
      url: `${appUrl}/clans/example/settings?tab=members`,
      firstName,
    },
    loc,
  );
}
