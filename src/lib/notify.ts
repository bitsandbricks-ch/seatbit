import { fmtDate } from "./format";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { api, discordEnabled } from "./discord-api";
import { appUrl, sendMail } from "./mail";
import { rolesWith } from "./clan-roles";
import type { Locale } from "../i18n/config";
import { makeT, type T } from "../i18n/translate";
import { localeOf } from "../i18n/user-locale";

const { account, attendance, user, clanMember } = schema;

/**
 * What a notification is about. "reminder" mails respect the member's email
 * reminder setting; everything else is mailed like before. Discord DMs go to
 * anyone who linked Discord and kept DMs on, for every kind.
 */
export type NoticeKind =
  | "reminder"
  | (string & {}) // mail template ids
  | "waitlist_promoted"
  | "waitlist_spot"
  | "seats_published"
  | "seat_changed"
  | "lan_changed"
  | "clan_request"
  | "clan_approved"
  | "clan_role"
  | "guest_claimed"
  | "guest_claim_request"
  | "guest_claim_approved"
  | "guest_claim_declined"
  | "guest_linked"
  | "signup_confirmed"
  | "platform_upgrade";

export type Notice = {
  kind: NoticeKind;
  subject: string;
  /** Plain-text body (the email). The DM uses it without the "Hi name," greeting. */
  text: string;
  /** Link for the DM button, e.g. the LAN page. */
  url?: string;
  /** HTML version of the mail (from renderTemplate). */
  html?: string;
  /** Discord-markdown DM text (from renderTemplate). Without it the DM is made from `text`. */
  dm?: string;
  /** Don't email, only DM (for small updates that aren't worth a mail). */
  dmOnly?: boolean;
  /** DM footer; the default points to the DM switch on the profile. */
  footer?: string;
  /** Extra DM buttons next to "Open in Seatbit" (Discord button components, e.g. "I have my ticket"). */
  buttons?: Record<string, unknown>[];
  /** Language of the DM's own labels (footer, "Open in Seatbit"). */
  locale?: Locale;
};

/** A notice, or one written per recipient in their language. */
export type NoticeFor = Notice | ((t: T) => Notice);

/** The notice in the member's language. */
export function noticeFor(u: { locale?: string | null } | null | undefined, n: NoticeFor): Notice {
  const t = makeT(localeOf(u));
  return { locale: t.locale, ...(typeof n === "function" ? n(t) : n) };
}

export type NotifyResult = { email: boolean; dm: boolean };

// ---------- Discord DMs ----------

const g = globalThis as unknown as { __seatbitDmChannels?: Map<string, string> };
const dmChannels = (g.__seatbitDmChannels ??= new Map());

function discordIdOf(userId: string) {
  return db
    .select({ id: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
    .get()?.id;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * DM text from a plain mail text: drops the greeting, the mail footer and the
 * bare link, then adds the link back as a visible "Open in Seatbit" link.
 */
export function dmBody(text: string, url?: string, open = "Open in Seatbit") {
  let t = text.replace(/^(Hi|Hallo)\b[^\n]*,\s*\n+/, "").replace(/\n*--\n[\s\S]*$/, "");
  if (url) t = t.split(url).join("").replace(/\n*(Details|Your seat and details|Pick your seat|Link):?\s*$/i, "");
  t = t.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return url ? `${t}\n\n[${open}](${url})` : t;
}

/** Why a DM couldn't be sent, so the profile test button and the logs can say it plainly. */
export type DmProblem = "dms_off" | "guest" | "bot_not_set_up" | "no_discord" | "cant_dm" | "error";

export type DmResult = { ok: true } | { ok: false; problem: DmProblem; detail?: string };

/** Sends a DM and says why when it can't. */
export async function trySendDiscordDm(
  u: Pick<User, "id" | "discordDms" | "isGuest"> & { locale?: string | null },
  nf: NoticeFor,
): Promise<DmResult> {
  const n = noticeFor(u, nf);
  if (!u.discordDms) return { ok: false, problem: "dms_off" };
  if (u.isGuest) return { ok: false, problem: "guest" };
  if (!discordEnabled()) return { ok: false, problem: "bot_not_set_up" };
  const discordId = discordIdOf(u.id);
  if (!discordId) return { ok: false, problem: "no_discord" };
  return dmDiscordUser(discordId, n);
}

/** DMs a Discord user by id, Seatbit account or not (e.g. someone a lead linked a guest to). */
export async function dmDiscordUser(discordId: string, n: Notice): Promise<DmResult> {
  if (!discordEnabled()) return { ok: false, problem: "bot_not_set_up" };
  const t = makeT(n.locale ?? "en");
  try {
    let channelId = dmChannels.get(discordId);
    if (!channelId) {
      channelId = (await api<{ id: string }>("POST", "/users/@me/channels", { recipient_id: discordId })).id;
      dmChannels.set(discordId, channelId);
    }
    await api("POST", `/channels/${channelId}/messages`, {
      embeds: [
        {
          title: clip(n.subject, 256),
          url: n.url,
          description: clip(n.dm ?? dmBody(n.text, n.url, t("notice.openInSeatbit")), 4000),
          color: 0x10b981,
          footer: { text: n.footer ?? t("notice.dmFooter") },
        },
      ],
      components:
        n.url || n.buttons?.length
          ? [
              {
                type: 1,
                components: [
                  ...(n.buttons ?? []),
                  ...(n.url ? [{ type: 2, style: 5, label: t("notice.openInSeatbit"), url: n.url }] : []),
                ].slice(0, 5),
              },
            ]
          : [],
      allowed_mentions: { parse: [] },
    });
    return { ok: true };
  } catch (e) {
    // 50007: can't DM this user (no shared server with the bot, or DMs from server members are off).
    const msg = String((e as Error).message);
    if (msg.includes("50007") || msg.includes("-> 403")) {
      console.warn(`[discord] can't DM ${discordId} (${n.kind}): ${msg}`);
      return { ok: false, problem: "cant_dm", detail: msg };
    }
    console.error(`[discord] DM to ${discordId} (${n.kind}) failed`, e);
    return { ok: false, problem: "error", detail: msg };
  }
}

/**
 * DMs a member through the bot. Returns false when they can't get one
 * (no linked Discord, DMs off, bot not set up, or Discord refuses because
 * they share no server with the bot or blocked DMs).
 */
export async function sendDiscordDm(u: Pick<User, "id" | "discordDms" | "isGuest"> & { locale?: string | null }, nf: NoticeFor) {
  const n = noticeFor(u, nf);
  const r = await trySendDiscordDm(u, n);
  if (!r.ok && r.problem === "bot_not_set_up") console.warn(`[discord] no DM (${n.kind}): bot token or application ID not set`);
  return r.ok;
}

// ---------- Fan-out ----------

/** Sends a notice to one member by email and/or Discord DM, depending on their settings. */
export async function notify(userOrId: User | string, nf: NoticeFor): Promise<NotifyResult> {
  const u = typeof userOrId === "string" ? db.select().from(user).where(eq(user.id, userOrId)).get() : userOrId;
  if (!u) return { email: false, dm: false };
  const n = noticeFor(u, nf);
  const wantsMail = !n.dmOnly && (n.kind !== "reminder" || u.emailReminders);
  let email = false;
  if (wantsMail) {
    try {
      await sendMail(u.email, n.subject, n.text, n.html);
      email = true;
    } catch (e) {
      // Constant format string: the address is user data and must not be read as printf placeholders.
      console.error("[mail] %s to %s failed", n.kind, u.email, e);
    }
  }
  const dm = await sendDiscordDm(u, n);
  return { email, dm };
}

/** Runs notifications after the response, so slow SMTP/Discord never blocks a page. */
export function notifyLater(task: () => Promise<unknown>) {
  void task().catch((e) => console.error("[notify] failed", e));
}

const lanUrl = (l: Lan) => `${appUrl}/lans/${l.id}`;
const fmt = fmtDate;

// ---------- Event helpers ----------

/** Tells a member their seat changed (only once the seat plan is final). */
export async function notifySeatChanged(l: Lan, userId: string, label: string | null) {
  if (!l.seatsPublishedAt || !l.publishedAt) return;
  await notify(userId, (t) => ({
    kind: "seat_changed",
    subject: label ? t("notice.seatNow", { lan: l.name, seat: label }) : t("notice.seatGone", { lan: l.name }),
    text: label ? t("notice.seatNowText", { lan: l.name, seat: label }) : t("notice.seatGoneText", { lan: l.name }),
    url: `${lanUrl(l)}?tab=seats`,
    dmOnly: true,
  }));
}

const DETAIL_FIELDS = [
  ["startsAt", "notice.field.start"],
  ["endsAt", "notice.field.end"],
  ["location", "notice.field.location"],
  ["signupDeadline", "notice.field.answerBy"],
  ["paymentDueDate", "notice.field.ticketBy"],
  ["price", "notice.field.price"],
  ["ticketUrl", "notice.field.ticketUrl"],
] as const;

/** Lines like "Start: Sat 03.01.2027, 18:00 → Sun 04.01.2027, 18:00" for the details that changed. */
export function lanChanges(before: Lan, after: Lan, t: T = makeT("en")) {
  const show = (v: unknown) => (v instanceof Date ? fmt(v, t.locale) : v ? String(v) : "—");
  const same = (a: unknown, b: unknown) =>
    a instanceof Date || b instanceof Date ? (a as Date | null)?.getTime() === (b as Date | null)?.getTime() : (a ?? "") === (b ?? "");
  return DETAIL_FIELDS.filter(([k]) => !same(before[k], after[k])).map(
    ([k, label]) => `${t(label)}: ${show(before[k])} → ${show(after[k])}`,
  );
}

/** Tells everyone coming, unsure or on the waitlist what changed about a LAN. */
export async function notifyLanChanged(before: Lan, after: Lan) {
  const changes = lanChanges(before, after);
  if (changes.length === 0 || after.endsAt < new Date() || !after.publishedAt) return 0;
  const rows = db
    .select({ u: user })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.lanId, after.id), inArray(attendance.status, ["going", "maybe", "waitlist"])))
    .all();
  for (const { u } of rows) {
    await notify(u, (t) => ({
      kind: "lan_changed",
      subject: t("notice.lanChanged", { lan: after.name }),
      text: `${t("mail.hi", { name: u.firstName || u.name })}\n\n${t("notice.lanChangedText", { lan: after.name })}\n\n${lanChanges(before, after, t).join("\n")}\n\n${lanUrl(after)}`,
      url: lanUrl(after),
    }));
  }
  return rows.length;
}

/** Tells whoever handles a clan's members (admins and recruiters) about a join request or a claimed guest profile (DM only). */
export async function notifyClanAdmins(clanId: string, n: Omit<Notice, "dmOnly"> | ((t: T) => Omit<Notice, "dmOnly">)) {
  const admins = db
    .select({ u: user })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(and(eq(clanMember.clanId, clanId), inArray(clanMember.role, rolesWith("members")), ne(user.isGuest, true)))
    .all();
  for (const { u } of admins) await sendDiscordDm(u, n);
}
