import { fmtDate } from "./format";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Lan, User } from "@/db/schema";
import { api, discordEnabled } from "./discord-api";
import { appUrl, sendMail } from "./mail";

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
  | "seats_published"
  | "seat_changed"
  | "lan_changed"
  | "clan_request"
  | "clan_approved"
  | "guest_claimed";

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
};

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
export function dmBody(text: string, url?: string) {
  let t = text.replace(/^Hi [^\n]*,\s*\n+/, "").replace(/\n*--\n[\s\S]*$/, "");
  if (url) t = t.split(url).join("").replace(/\n*(Details|Your seat and details|Pick your seat|Link):?\s*$/i, "");
  t = t.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return url ? `${t}\n\n[Open in Seatbit](${url})` : t;
}

/** Why a DM couldn't be sent, so the profile test button and the logs can say it plainly. */
export type DmProblem = "dms_off" | "guest" | "bot_not_set_up" | "no_discord" | "cant_dm" | "error";

export type DmResult = { ok: true } | { ok: false; problem: DmProblem; detail?: string };

/** Sends a DM and says why when it can't. */
export async function trySendDiscordDm(u: Pick<User, "id" | "discordDms" | "isGuest">, n: Notice): Promise<DmResult> {
  if (!u.discordDms) return { ok: false, problem: "dms_off" };
  if (u.isGuest) return { ok: false, problem: "guest" };
  if (!discordEnabled()) return { ok: false, problem: "bot_not_set_up" };
  const discordId = discordIdOf(u.id);
  if (!discordId) return { ok: false, problem: "no_discord" };
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
          description: clip(n.dm ?? dmBody(n.text, n.url), 4000),
          color: 0x10b981,
          footer: { text: "Seatbit · turn these DMs off on your profile" },
        },
      ],
      components: n.url ? [{ type: 1, components: [{ type: 2, style: 5, label: "Open in Seatbit", url: n.url }] }] : [],
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
export async function sendDiscordDm(u: Pick<User, "id" | "discordDms" | "isGuest">, n: Notice) {
  const r = await trySendDiscordDm(u, n);
  if (!r.ok && r.problem === "bot_not_set_up") console.warn(`[discord] no DM (${n.kind}): bot token or application ID not set`);
  return r.ok;
}

// ---------- Fan-out ----------

/** Sends a notice to one member by email and/or Discord DM, depending on their settings. */
export async function notify(userOrId: User | string, n: Notice): Promise<NotifyResult> {
  const u = typeof userOrId === "string" ? db.select().from(user).where(eq(user.id, userOrId)).get() : userOrId;
  if (!u) return { email: false, dm: false };
  const wantsMail = !n.dmOnly && (n.kind !== "reminder" || u.emailReminders);
  let email = false;
  if (wantsMail) {
    try {
      await sendMail(u.email, n.subject, n.text, n.html);
      email = true;
    } catch (e) {
      console.error(`[mail] ${n.kind} to ${u.email} failed`, e);
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
  if (!l.seatsPublishedAt) return;
  await notify(userId, {
    kind: "seat_changed",
    subject: label ? `Your seat at ${l.name} is now ${label}` : `You no longer have a seat at ${l.name}`,
    text: label
      ? `Your seat at ${l.name} changed. You're now sitting at ${label}.`
      : `An orga took you off your seat at ${l.name}. They'll get back to you.`,
    url: `${lanUrl(l)}?tab=seats`,
    dmOnly: true,
  });
}

const DETAIL_FIELDS = [
  ["startsAt", "Start"],
  ["endsAt", "End"],
  ["location", "Location"],
  ["signupDeadline", "Answer by"],
  ["paymentDueDate", "Ticket by"],
  ["price", "Price"],
  ["ticketUrl", "Ticket link"],
] as const;

/** Lines like "Start: 3 Jan → 4 Jan" for the details that changed. */
export function lanChanges(before: Lan, after: Lan) {
  const show = (v: unknown) => (v instanceof Date ? fmt(v) : v ? String(v) : "—");
  const same = (a: unknown, b: unknown) =>
    a instanceof Date || b instanceof Date ? (a as Date | null)?.getTime() === (b as Date | null)?.getTime() : (a ?? "") === (b ?? "");
  return DETAIL_FIELDS.filter(([k]) => !same(before[k], after[k])).map(
    ([k, label]) => `${label}: ${show(before[k])} → ${show(after[k])}`,
  );
}

/** Tells everyone coming, unsure or on the waitlist what changed about a LAN. */
export async function notifyLanChanged(before: Lan, after: Lan) {
  const changes = lanChanges(before, after);
  if (changes.length === 0 || after.endsAt < new Date()) return 0;
  const rows = db
    .select({ u: user })
    .from(attendance)
    .innerJoin(user, eq(user.id, attendance.userId))
    .where(and(eq(attendance.lanId, after.id), inArray(attendance.status, ["going", "maybe", "waitlist"])))
    .all();
  for (const { u } of rows) {
    await notify(u, {
      kind: "lan_changed",
      subject: `${after.name}: details changed`,
      text: `Hi ${u.name},\n\nthe orgas changed ${after.name}:\n\n${changes.join("\n")}\n\n${lanUrl(after)}`,
      url: lanUrl(after),
    });
  }
  return rows.length;
}

/** Tells a clan's admins about a join request or a claimed guest profile (DM only). */
export async function notifyClanAdmins(clanId: string, n: Omit<Notice, "dmOnly">) {
  const admins = db
    .select({ u: user })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .where(and(eq(clanMember.clanId, clanId), eq(clanMember.role, "admin"), ne(user.isGuest, true)))
    .all();
  for (const { u } of admins) await sendDiscordDm(u, n);
}
