import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus, InterestAnswer, Lan } from "@/db/schema";
import { avatarUrl, clanCan, getClan, myClans } from "./clans";
import { roleCan } from "./clan-roles";
import { platformCan } from "./platform-roles";
import { type ChatReminderKind, fmtWhen, lanFacts, lanLink, lanSummary } from "./announce";
import { getDisplayNames, getLan, signupClosed } from "./lans";
import { type Json, api, discordEnabled } from "./discord-api";
import type { DiscordMode } from "./discord-modes";
import { getSetting } from "./settings";
import { appUrl } from "./mail";
import { audit } from "./audit";
import { claimableGuests, claimOrRequestGuest, discordClaimTicket, guestSuggestions, mergeGuestInto } from "./guest-claim";
import { nameMatches } from "./names";
import { type DmResult, dmDiscordUser, notify, notifyLater } from "./notify";
import { makeT, type T } from "../i18n/translate";
import { clanLocale } from "../i18n/user-locale";
import { answerEvent, answerInterest, handleMemberCommand, handleTicketButton, memberAutocomplete } from "./discord-commands";
import { lanChanged } from "./live";
import {
  type DiscordUser,
  type Handled,
  type Interaction,
  EPHEMERAL,
  clanForGuild,
  clip,
  interactionT,
  linkButton,
  nextDeadline,
  notLinked,
  reply,
  seatbitUserFor,
  canManageGuild,
  upcomingLans,
} from "./discord-common";

const { discordChannel, discordMessage, channelReminderLog, account, attendance, user } = schema;

const appId = () => getSetting("discord.clientId");
const profileComplete = (u: { firstName: string; lastName: string }) => !!(u.firstName && u.lastName);

// ---------- Request verification ----------

// DER prefix that turns a raw 32-byte Ed25519 key into an SPKI public key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Checks Discord's Ed25519 signature on an interaction request. */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null) {
  const publicKey = getSetting("discord.publicKey");
  if (!publicKey || !signature || !timestamp) return false;
  // Signed requests older than five minutes are replays.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKey, "hex")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(timestamp + body), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// ---------- Messages ----------

const BRAND = 0x10b981;
const list = (names: string[]) => clip(names.join(", ") || "—", 1024);

/** Channel posts speak the clan's language (Discord language setting in the clan settings). */
export function lanT(l: Pick<Lan, "clanId">): T {
  return makeT(clanLocale(l.clanId ? getClan(l.clanId) : null));
}

/** Discord user ids of members who linked their Discord account, by Seatbit user id. */
function discordIds(): Map<string, string> {
  const rows = db.select().from(account).where(eq(account.providerId, "discord")).all();
  return new Map(rows.map((r) => [r.userId, r.accountId]));
}

function attendanceButtons(l: Lan, t: T, disabled = false) {
  const btn = (status: AttendanceStatus, label: string, style: number) => ({
    type: 2,
    style,
    label,
    custom_id: `att:${l.id}:${status}`,
    disabled,
  });
  return [
    {
      type: 1,
      components: [
        btn("going", t("nudge.going"), 3),
        btn("maybe", t("nudge.maybe"), 2),
        btn("declined", t("nudge.declined"), 4),
        { type: 2, style: 5, label: t("notice.openInSeatbit"), url: lanLink(l) },
      ],
    },
  ];
}

/** Interest check buttons: would you come? */
function interestButtons(l: Lan, t: T) {
  const btn = (a: InterestAnswer, label: string, style: number) => ({ type: 2, style, label, custom_id: `int:${l.id}:${a}` });
  return [
    {
      type: 1,
      components: [
        btn("yes", t("eventUi.idCome"), 3),
        btn("maybe", t("eventUi.maybe"), 2),
        btn("no", t("eventUi.notThisTime"), 4),
        { type: 2, style: 5, label: t("notice.openInSeatbit"), url: lanLink(l) },
      ],
    },
  ];
}

/** The interest check post: who'd come, who maybe. */
async function interestMessage(l: Lan) {
  const t = lanT(l);
  const rows = db.select().from(schema.lanInterest).where(eq(schema.lanInterest.lanId, l.id)).all();
  const names = await getDisplayNames(l.id, rows.map((r) => r.userId));
  const who = (a: string) => rows.filter((r) => r.answer === a).map((r) => names.get(r.userId) ?? "?").sort((x, y) => x.localeCompare(y));
  const yes = who("yes");
  const maybe = who("maybe");
  const c = l.clanId ? getClan(l.clanId) : undefined;
  const icon = c && avatarUrl(c);
  const fields = lanFacts(l, t).map(([name, value]) => ({ name, value: clip(value, 1024), inline: true }));
  fields.push({ name: t("bot.wouldCome", { count: yes.length }), value: list(yes), inline: false });
  if (maybe.length) fields.push({ name: t("bot.maybeCount", { count: maybe.length }), value: list(maybe), inline: false });
  return {
    embeds: [
      {
        author: c ? { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined } : undefined,
        title: clip(t("bot.interestTitle", { lan: l.name }), 256),
        url: lanLink(l),
        description: clip(l.description, 1500) || undefined,
        color: BRAND,
        fields,
        footer: { text: t("bot.interestFooter") },
      },
    ],
    components: interestButtons(l, t),
    allowed_mentions: { parse: [] },
  };
}

/** The LAN announcement: details, live attendee list and attendance buttons. */
export async function lanMessage(l: Lan) {
  if (l.interestCheck && !l.cancelledAt) return interestMessage(l);
  const t = lanT(l);
  const s = await lanSummary(l);
  const closed = !!signupClosed(l);
  const fields = lanFacts(l, t).map(([name, value]) => ({ name, value: clip(value, 1024), inline: true }));
  fields.push({
    name: `${t("bot.coming")} (${s.going.length}${l.capacity ? `/${l.capacity}` : ""})`,
    value: list(s.going.map((g) => g.name)),
    inline: false,
  });
  if (s.maybe.length) fields.push({ name: `${t("bot.unsure")} (${s.maybe.length})`, value: list(s.maybe.map((g) => g.name)), inline: false });
  if (s.waitlist.length)
    fields.push({
      name: t("bot.waitlist", { count: s.waitlist.length }),
      value: list(s.waitlist.map((g, i) => `${i + 1}. ${g.name}`)),
      inline: false,
    });
  // Live status: tickets, seat bookings and what's due next.
  const status = [
    s.going.length ? `🎟️ ${t("bot.tickets")}: **${s.going.length - s.goingNoTicket}/${s.going.length}**` : "",
    s.seated ? `💺 ${t("bot.seatsBooked")}: **${s.booked}/${s.seated}**` : "",
    nextDeadline(l, new Date(), t),
  ].filter(Boolean);
  if (status.length) fields.push({ name: t("bot.status"), value: clip(status.join("\n"), 1024), inline: false });
  const c = l.clanId ? getClan(l.clanId) : undefined;
  const icon = c && avatarUrl(c);
  return {
    embeds: [
      {
        author: c ? { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined } : undefined,
        title: clip(l.cancelledAt ? `❌ ${t("bot.cancelled", { lan: l.name })}` : l.name, 256),
        url: lanLink(l),
        description: clip(l.cancelledAt ? l.cancelReason || t("bot.cancelledText") : l.description, 1500) || undefined,
        color: l.cancelledAt ? 0xef4444 : BRAND,
        fields,
        footer: { text: l.cancelledAt ? t("bot.cancelledFooter") : closed ? t("bot.closedFooter") : t("bot.openFooter") },
      },
    ],
    components: l.cancelledAt ? [] : attendanceButtons(l, t, closed),
    allowed_mentions: { parse: [] },
  };
}

const AMBER = 0xf59e0b;

/** Embed author line: the event's clan with its avatar. */
function clanAuthor(l: Lan) {
  const c = l.clanId ? getClan(l.clanId) : undefined;
  if (!c) return undefined;
  const icon = avatarUrl(c);
  return { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined };
}

/** Reminder embed for a channel, pinging linked members it applies to (pings must be in the content to notify). */
async function reminderMessage(kind: ChatReminderKind, l: Lan) {
  const t = lanT(l);
  const s = await lanSummary(l);
  // Nobody left to nudge: skip the post.
  if ((kind === "signup" && s.undecided.length === 0) || (kind === "payment" && s.noTicket.length === 0)) return null;
  if (kind === "event" && s.going.length === 0) return null;
  const ids = discordIds();
  const targets = kind === "signup" ? s.undecided.map((u) => u.id) : kind === "payment" ? s.noTicket.map((u) => u.id) : s.going.map((g) => g.userId);
  const linked = targets.map((id) => ids.get(id)).filter((x): x is string => !!x);
  const unlinked = targets.length - linked.length;
  const names = await getDisplayNames(l.id, targets);
  const who = targets.map((id) => names.get(id) ?? "?").sort((a, b) => a.localeCompare(b));

  let embed: Json;
  switch (kind) {
    case "signup":
      embed = {
        title: `⏰ ${t("bot.remindSignup", { lan: l.name })}`,
        description: t("bot.remindSignupText", { date: `**${fmtWhen(l.signupDeadline!, t.locale)}**` }),
        color: AMBER,
        fields: [{ name: t("bot.waitingOn", { count: who.length }), value: list(who) }],
      };
      break;
    case "payment":
      embed = {
        title: `🎟️ ${t("bot.remindPayment", { lan: l.name })}`,
        description: t("bot.remindPaymentText", { date: `**${fmtWhen(l.paymentDueDate!, t.locale)}**` }),
        color: AMBER,
        fields: [
          ...(l.ticketUrl ? [{ name: t("bot.ticketShop"), value: clip(l.ticketUrl, 1024), inline: true }] : []),
          ...(l.price ? [{ name: t("notice.field.price"), value: clip(l.price, 1024), inline: true }] : []),
          { name: t("bot.openFor", { count: who.length }), value: list(who) },
        ],
      };
      break;
    case "event":
      embed = {
        title: `🚀 ${t("bot.startsSoon", { lan: l.name })}`,
        description: t("bot.seeYou"),
        color: BRAND,
        fields: [
          { name: t("bot.when"), value: fmtWhen(l.startsAt, t.locale), inline: true },
          ...(l.location ? [{ name: t("bot.where"), value: clip(l.location, 1024), inline: true }] : []),
          { name: `${t("bot.coming")} (${who.length})`, value: list(who) },
        ],
      };
      break;
  }
  const buttons =
    kind === "signup"
      ? attendanceButtons(l, t)
      : [
          {
            type: 1,
            components: [
              ...(kind === "payment" && l.ticketUrl ? [{ type: 2, style: 5, label: t("nudge.buyTicket"), url: l.ticketUrl }] : []),
              { type: 2, style: 5, label: t("notice.openInSeatbit"), url: lanLink(l) },
            ],
          },
        ];
  return {
    content: clip(linked.map((id) => `<@${id}>`).join(" "), 2000) || undefined,
    embeds: [
      {
        ...embed,
        title: clip(embed.title as string, 256),
        author: clanAuthor(l),
        url: lanLink(l),
        footer: unlinked ? { text: t("bot.unlinked", { count: unlinked }) } : undefined,
      },
    ],
    components: buttons,
    allowed_mentions: { users: linked.slice(0, 100) },
  };
}

/** Lead news as an embed, for the event's thread or channel. */
function newsMessage(l: Lan, text: string, author: string) {
  const t = lanT(l);
  return {
    embeds: [
      {
        author: clanAuthor(l),
        title: clip(`📣 ${t("bot.news", { lan: l.name })}`, 256),
        url: lanLink(l),
        description: clip(text, 4000),
        color: BRAND,
        footer: { text: clip(t("bot.newsFrom", { name: author }), 2048) },
      },
    ],
    components: [linkButton(t("notice.openInSeatbit"), lanLink(l))],
    allowed_mentions: { parse: [] },
  };
}

// ---------- Posting ----------

/** Channels linked to a clan (a LAN only goes to its own clan's channels). */
export function listChannels(clanId: string | null) {
  if (!clanId) return [];
  return db.select().from(discordChannel).where(eq(discordChannel.clanId, clanId)).orderBy(asc(discordChannel.createdAt)).all();
}

/** Drops a channel the bot can no longer reach (deleted, or bot kicked). */
function forgetIfGone(channelId: string, e: unknown) {
  const status = (e as { status?: number }).status;
  if (status === 404 || status === 403) {
    console.warn(`[discord] channel ${channelId} unreachable (${status}), removing it`);
    db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
    db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
    return true;
  }
  return false;
}

type Post = typeof discordMessage.$inferSelect;

/** Where an event's Discord things go: its LAN type's setting, plain channel otherwise. */
export function discordModeOf(l: Pick<Lan, "typeId">): DiscordMode {
  if (!l.typeId) return "channel";
  return db.select({ m: schema.lanType.discordMode }).from(schema.lanType).where(eq(schema.lanType.id, l.typeId)).get()?.m ?? "channel";
}

/** Discord channel names: lowercase, dashes, no spaces. */
export function eventChannelName(l: Pick<Lan, "name">) {
  const name = l.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return name || "lan";
}

/** Makes a text channel for the event in the linked channel's category. Needs "Manage Channels". */
async function createEventChannel(l: Lan, home: typeof discordChannel.$inferSelect) {
  const parent = await api<{ parent_id?: string | null }>("GET", `/channels/${home.channelId}`).catch(() => ({ parent_id: null }));
  const ch = await api<{ id: string }>("POST", `/guilds/${home.guildId}/channels`, {
    name: eventChannelName(l),
    type: 0,
    topic: clip(`${l.name} · ${lanLink(l)}`, 1024),
    ...(parent.parent_id && { parent_id: parent.parent_id }),
  });
  return ch.id;
}

/** Posts the announcement for one linked channel, in the place the event's mode asks for. */
async function postAnnouncement(l: Lan, home: typeof discordChannel.$inferSelect, msg: Json, mode: DiscordMode) {
  let eventChannelId: string | null = null;
  if (mode === "event_channel") {
    // Without "Manage Channels" the post falls back to the linked channel.
    eventChannelId = await createEventChannel(l, home).catch((e) => {
      console.warn(`[discord] couldn't create a channel for ${l.name}: ${(e as Error).message}`);
      return null;
    });
  }
  const where = eventChannelId ?? home.channelId;
  const m = await api<{ id: string }>("POST", `/channels/${where}/messages`, msg);
  // Pin the live post so it's easy to find. Needs the "Pin Messages" permission; fine without.
  await api("PUT", `/channels/${where}/pins/${m.id}`).catch((e) =>
    console.warn(`[discord] couldn't pin in ${where}: ${(e as Error).message}`),
  );
  let threadId: string | null = null;
  if (mode === "thread") {
    // A thread on the post keeps reminders and news out of the main channel. Needs "Create Public Threads".
    threadId = await api<{ id: string }>("POST", `/channels/${where}/messages/${m.id}/threads`, {
      name: clip(l.name, 100),
      auto_archive_duration: 10080,
    })
      .then((t) => t.id)
      .catch((e) => {
        console.warn(`[discord] couldn't start a thread for ${l.name}: ${(e as Error).message}`);
        return null;
      });
  }
  if (eventChannelId) {
    // Point the linked channel at the new one, so people find it.
    await api("POST", `/channels/${home.channelId}/messages`, {
      content: `📣 ${lanT(l)("bot.ownChannel", { lan: `**${clip(l.name, 200)}**`, channel: `<#${eventChannelId}>` })}`,
      allowed_mentions: { parse: [] },
    }).catch(() => {});
  }
  db.insert(discordMessage).values({ lanId: l.id, channelId: home.channelId, messageId: m.id, threadId, eventChannelId }).run();
}

/**
 * Posts the LAN announcement to every configured channel that doesn't have it
 * yet, and refreshes it where it exists. Returns how many channels got a new post.
 */
export async function announceLan(lanId: string, onlyChannelId?: string) {
  if (!discordEnabled()) return 0;
  const l = getLan(lanId);
  // Drafts stay off Discord until a lead publishes them.
  if (!l?.publishedAt) return 0;
  const msg = await lanMessage(l);
  const mode = discordModeOf(l);
  const existing = new Set(
    db.select().from(discordMessage).where(eq(discordMessage.lanId, lanId)).all().map((m) => m.channelId),
  );
  let posted = 0;
  for (const c of listChannels(l.clanId)) {
    if (existing.has(c.channelId) || (onlyChannelId && c.channelId !== onlyChannelId)) continue;
    try {
      await postAnnouncement(l, c, msg, mode);
      posted++;
    } catch (e) {
      if (!forgetIfGone(c.channelId, e)) console.error("[discord] announce failed", e);
    }
  }
  await refreshLanMessages(lanId);
  return posted;
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Updates the attendee list on every posted announcement for a LAN (debounced). */
export function refreshLanMessagesSoon(lanId: string) {
  // Whatever changes the event's Discord message also changes its open pages.
  lanChanged(lanId);
  if (!discordEnabled()) return;
  clearTimeout(pending.get(lanId));
  pending.set(
    lanId,
    setTimeout(() => {
      pending.delete(lanId);
      refreshLanMessages(lanId).catch((e) => console.error("[discord] refresh failed", e));
    }, 1500),
  );
}

export async function refreshLanMessages(lanId: string) {
  if (!discordEnabled()) return;
  const l = getLan(lanId);
  const posts = db.select().from(discordMessage).where(eq(discordMessage.lanId, lanId)).all();
  if (!l || posts.length === 0) return;
  const msg = await lanMessage(l);
  for (const p of posts) {
    try {
      await api("PATCH", `/channels/${p.eventChannelId ?? p.channelId}/messages/${p.messageId}`, msg);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Message (or the event's channel) was deleted by someone: forget it, so "Post to Discord" can post it again.
      if (status === 404) db.delete(discordMessage).where(eq(discordMessage.id, p.id)).run();
      else console.error("[discord] edit failed", e);
    }
  }
}

/**
 * Posts a follow-up (reminder, news) for an event in one linked channel: in the event's thread or
 * channel when it has one, else in the linked channel itself.
 */
async function postFollowUp(home: string, post: Post | undefined, msg: Json) {
  const target = post?.threadId ?? post?.eventChannelId ?? home;
  if (target === home) return api("POST", `/channels/${home}/messages`, msg);
  try {
    // Threads archive after a week of quiet; reopen it first (fails harmlessly when it's open).
    if (target === post?.threadId) await api("PATCH", `/channels/${target}`, { archived: false }).catch(() => {});
    return await api("POST", `/channels/${target}/messages`, msg);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404 && status !== 403) throw e;
    // Thread or event channel deleted (or locked for the bot): forget it and use the linked channel.
    console.warn(`[discord] event thread/channel ${target} unreachable (${status}), using ${home}`);
    db.update(discordMessage)
      .set(target === post?.threadId ? { threadId: null } : { eventChannelId: null })
      .where(eq(discordMessage.id, post!.id))
      .run();
    return api("POST", `/channels/${home}/messages`, msg);
  }
}

const postsByChannel = (lanId: string) =>
  new Map(db.select().from(discordMessage).where(eq(discordMessage.lanId, lanId)).all().map((p) => [p.channelId, p]));

/** Posts a reminder to every channel now (lead "nudge" button). */
export async function postReminderNow(l: Lan, kind: ChatReminderKind) {
  if (!discordEnabled()) return 0;
  const msg = await reminderMessage(kind, l);
  if (!msg) return 0;
  const posts = postsByChannel(l.id);
  let sent = 0;
  for (const c of listChannels(l.clanId)) {
    try {
      await postFollowUp(c.channelId, posts.get(c.channelId), msg);
      db.insert(channelReminderLog)
        .values({ lanId: l.id, channelId: c.channelId, kind })
        .onConflictDoUpdate({
          target: [channelReminderLog.lanId, channelReminderLog.channelId, channelReminderLog.kind],
          set: { sentAt: new Date() },
        })
        .run();
      sent++;
    } catch (e) {
      if (!forgetIfGone(c.channelId, e)) console.error("[discord] reminder failed", e);
    }
  }
  return sent;
}

/** Posts due reminders that haven't been posted to a channel yet (called by the reminder scheduler). */
export async function postDueChannelReminders(kinds: ChatReminderKind[], l: Lan) {
  if (!discordEnabled() || kinds.length === 0) return 0;
  const posts = postsByChannel(l.id);
  let sent = 0;
  for (const kind of kinds) {
    const done = new Set(
      db
        .select()
        .from(channelReminderLog)
        .where(and(eq(channelReminderLog.lanId, l.id), eq(channelReminderLog.kind, kind)))
        .all()
        .map((r) => r.channelId),
    );
    const todo = listChannels(l.clanId).filter((c) => !done.has(c.channelId));
    if (todo.length === 0) continue;
    const msg = await reminderMessage(kind, l);
    if (!msg) continue;
    for (const c of todo) {
      try {
        await postFollowUp(c.channelId, posts.get(c.channelId), msg);
        db.insert(channelReminderLog).values({ lanId: l.id, channelId: c.channelId, kind }).onConflictDoNothing().run();
        sent++;
      } catch (e) {
        if (!forgetIfGone(c.channelId, e)) console.error("[discord] reminder failed", e);
      }
    }
  }
  return sent;
}

/**
 * Posts lead news in the event's own thread or channel. Events in the plain channel mode don't get it
 * there (members already get it by DM), so the main channel stays quiet.
 */
export async function postLanNews(l: Lan, text: string, author: string) {
  if (!discordEnabled()) return 0;
  const posts = db.select().from(discordMessage).where(eq(discordMessage.lanId, l.id)).all();
  const msg = newsMessage(l, text, author);
  let sent = 0;
  for (const p of posts) {
    if (!p.threadId && !p.eventChannelId) continue;
    try {
      await postFollowUp(p.channelId, p, msg);
      sent++;
    } catch (e) {
      console.error("[discord] news failed", e);
    }
  }
  return sent;
}

// ---------- Slash commands & buttons ----------


/** Clans this user may link a server to: only clans they're an admin of (platform owners and admins included). */
function manageableClans(u: { id: string; role: string }) {
  return myClans(u.id)
    .filter((m) => platformCan(u, "clans") || roleCan(m.role, "settings"))
    .map((m) => m.clan);
}

/**
 * Handles a verified interaction. Returns the immediate response, plus an
 * optional task to run after responding (Discord wants an answer within 3s).
 */
export function handleInteraction(i: Interaction): Handled {
  if (i.type === 1) return { response: { type: 1 } }; // PING
  const t = interactionT(i);

  const discordUser = i.member?.user.id ?? i.user?.id ?? "";
  const editReply = (body: Json) => api("PATCH", `/webhooks/${appId()}/${i.token}/messages/@original`, body);
  const sub = i.data?.options?.[0];

  // Autocomplete for /guest member:<…>: Discord members who aren't in the clan on Seatbit yet.
  if (i.type === 4 && i.data?.name === "guest" && i.data.options?.find((o) => o.focused)?.name === "member") {
    return { response: memberChoices(i) };
  }

  // Autocomplete for /claim guest:<…> and /guest guest:<…>: the server's clan's guests nobody took over yet.
  if (i.type === 4 && (i.data?.name === "claim" || i.data?.name === "guest")) {
    const c = clanForGuild(i.guild_id);
    const q = String(i.data.options?.find((o) => o.focused)?.value ?? "");
    // /claim: what's still free for the caller; /guest (leads): guests nobody asked for, linked ones included so they can be re-linked.
    const me = i.data.name === "claim" ? seatbitUserFor(discordUser) : undefined;
    const free = c
      ? i.data.name === "claim"
        ? claimableGuests(c.id, me?.id ?? null, discordUser)
        : claimableGuests(c.id, null, null, { includeLinked: true })
      : [];
    const choices = free
      .filter((g) => !q || nameMatches(g.name, q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 25)
      .map((g) => ({
        name: clip(i.data?.name === "guest" && g.guestDiscordId ? `${g.name} · ${t("bot.linkedTo", { name: g.guestDiscordName ?? t("bot.aDiscordMember") })}` : g.name, 100),
        value: g.id,
      }));
    return { response: { type: 8, data: { choices } } };
  }

  // Autocomplete for the member commands' event and person options
  const suggestions = memberAutocomplete(i);
  if (suggestions) return { response: suggestions };

  // Autocomplete for /seatbit here clan:<…>
  if (i.type === 4 && i.data?.name === "seatbit") {
    const me = seatbitUserFor(discordUser);
    const q = String(sub?.options?.find((o) => o.focused)?.value ?? "").toLowerCase();
    const choices = (me ? manageableClans(me) : [])
      .filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q))
      .slice(0, 25)
      .map((c) => ({ name: clip(c.name, 100), value: c.slug }));
    return { response: { type: 8, data: { choices } } };
  }

  // "I booked it" button in older seat DMs: the leads book seats on the event site now.
  if (i.type === 3 && i.data?.custom_id?.startsWith("booked:")) {
    const l = getLan(i.data.custom_id.slice("booked:".length));
    if (!l) return { response: reply(t("bot.lanGone")) };
    return {
      response: reply(t("bot.noNeedBooked", { lan: `**${l.name}**` }), {
        components: [linkButton(t("notice.openInSeatbit"), lanLink(l))],
      }),
    };
  }

  // Interest check and attendance buttons (announcements, reminders, /lans, /coming)
  if (i.type === 3 && (i.data?.custom_id?.startsWith("int:") || i.data?.custom_id?.startsWith("att:"))) {
    const [kind, lanId, answer] = i.data.custom_id.split(":");
    const l = getLan(lanId);
    if (!l) return { response: reply(t("bot.lanGone")) };
    const me = seatbitUserFor(discordUser);
    if (!me) return { response: notLinked(t) };
    return kind === "int"
      ? answerInterest(l, me, answer as InterestAnswer, t)
      : answerEvent(l, me, answer as AttendanceStatus, editReply, t);
  }

  // "I have my ticket" button from /ticket and /status
  if (i.type === 3 && i.data?.custom_id?.startsWith("ticket:")) return handleTicketButton(i);

  // Member commands: /coming, /unsure, /not-coming, /status, /ticket, /nick, /wish
  const member = handleMemberCommand(i, editReply);
  if (member) return member;

  // /claim [guest:<…>], and the "That's me" buttons it shows
  if (i.type === 2 && i.data?.name === "claim") {
    const wanted = i.data.options?.find((o) => o.name === "guest")?.value;
    return claimCommand(i, t, wanted ? String(wanted) : undefined);
  }
  if (i.type === 3 && i.data?.custom_id?.startsWith("claim:")) {
    return claimCommand(i, t, i.data.custom_id.slice("claim:".length));
  }

  // /guest member:<@…> guest:<…>: a lead says who a guest is
  if (i.type === 2 && i.data?.name === "guest") return linkGuestCommand(i, t, editReply);

  // /lans: this server's clan, or (in DMs / unlinked servers) all of your clans
  if (i.type === 2 && i.data?.name === "lans") {
    const me = seatbitUserFor(discordUser);
    const serverClan = clanForGuild(i.guild_id);
    const clanIds = serverClan ? [serverClan.id] : me ? myClans(me.id).filter((m) => m.role !== "pending").map((m) => m.clan.id) : [];
    if (!serverClan && !me) return { response: notLinked(t) };
    const upcoming = upcomingLans(clanIds).slice(0, 5);
    if (upcoming.length === 0)
      return { response: reply(serverClan ? t("bot.noUpcomingFor", { clan: serverClan.name }) : t("bot.noUpcoming")) };
    const mine = me
      ? new Map(db.select().from(attendance).where(eq(attendance.userId, me.id)).all().map((a) => [a.lanId, a.status]))
      : new Map<string, AttendanceStatus>();
    const label: Record<string, string> = {
      going: t("bot.you.going"),
      maybe: t("bot.you.maybe"),
      declined: t("bot.you.declined"),
      waitlist: t("bot.you.waitlist"),
    };
    const lines = upcoming.map(
      (l) =>
        `**[${l.name}](<${lanLink(l)}>)** · ${fmtWhen(l.startsAt, t.locale)}${me ? ` · ${t("bot.you.label")}: ${label[mine.get(l.id) ?? ""] ?? t("bot.you.none")}` : ""}`,
    );
    return {
      response: reply(lines.join("\n") + (me ? "" : `\n\n-# ${t("bot.linkToAnswer")}`), {
        components: upcoming
          .filter((l) => !signupClosed(l))
          .slice(0, 4)
          .map((l) => ({
            type: 1,
            components: [
              { type: 2, style: 3, label: clip(`${t("nudge.going")}: ${l.name}`, 80), custom_id: `att:${l.id}:going` },
              { type: 2, style: 2, label: t("nudge.maybe"), custom_id: `att:${l.id}:maybe` },
              { type: 2, style: 4, label: t("nudge.declined"), custom_id: `att:${l.id}:declined` },
            ],
          })),
      }),
    };
  }

  // /seatbit here|stop|announce (Discord only shows it to members with Manage Server)
  if (i.type === 2 && i.data?.name === "seatbit") {
    if (!i.guild_id || !i.channel_id) return { response: reply(t("bot.useInServer")) };
    // Discord hides the command from others by default, but server admins can change that: check here too.
    if (!canManageGuild(i)) return { response: reply(t("bot.needManageServer")) };
    const guildId = i.guild_id;
    const channelId = i.channel_id;

    if (sub?.name === "here") {
      const me = seatbitUserFor(discordUser);
      if (!me) return { response: notLinked(t) };
      const mine = manageableClans(me);
      if (mine.length === 0) {
        return {
          response: reply(t("bot.needAdmin"), {
            components: [linkButton(t("bot.openSeatbit"), appUrl)],
          }),
        };
      }
      const wanted = sub.options?.find((o) => o.name === "clan")?.value;
      const target = wanted ? mine.find((c) => c.slug === wanted) : mine.length === 1 ? mine[0] : undefined;
      if (!target) {
        return {
          response: reply(
            wanted
              ? t("bot.cantManage")
              : t("bot.severalClans", { clans: mine.map((c) => c.name).join(", ") }),
          ),
        };
      }
      const existing = clanForGuild(guildId);
      if (existing && existing.id !== target.id) {
        return {
          response: reply(t("bot.alreadyLinked", { clan: `**${existing.name}**` })),
        };
      }
      db.insert(discordChannel)
        .values({ clanId: target.id, guildId, channelId, channelName: i.channel?.name ?? "", addedBy: discordUser })
        .onConflictDoUpdate({ target: discordChannel.channelId, set: { clanId: target.id, channelName: i.channel?.name ?? "" } })
        .run();
      return {
        response: reply(`👍 ${t("bot.linked", { clan: `**${target.name}**` })}`),
      };
    }

    if (sub?.name === "stop") {
      db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
      db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
      return { response: reply(t("bot.stopped")) };
    }

    if (sub?.name === "announce") {
      const known = db.select().from(discordChannel).where(eq(discordChannel.channelId, channelId)).get();
      if (!known) return { response: reply(t("bot.runHereFirst")) };
      return {
        response: { type: 5, data: { flags: EPHEMERAL } },
        later: async () => {
          let n = 0;
          for (const l of upcomingLans([known.clanId])) n += await announceLan(l.id, channelId);
          await editReply({ content: n ? t("bot.posted", { count: n }) : t("bot.allPosted") });
        },
      };
    }
  }

  return { response: reply(t("bot.unknown")) };
}

// ---------- Guest claims ----------

/** The names someone goes by on Discord: server nick, display name and username. */
function discordNames(u: DiscordUser | undefined, nick?: string | null) {
  return [nick, u?.global_name, u?.username].filter((n): n is string => !!n);
}

/**
 * /claim and its buttons. Without a guest: lists the guests that look like the caller.
 * With one: takes it over (or asks the admins) when the caller has a Seatbit account,
 * else hands them a sign-in link that carries the claim over.
 */
function claimCommand(i: Interaction, t: T, guestId?: string): { response: Json } {
  const c = clanForGuild(i.guild_id);
  if (!c) return { response: reply(t("bot.serverNotLinkedAsk")) };
  if (c.guestClaims === "off") return { response: reply(t("bot.claimsOff", { clan: `**${c.name}**` })) };
  const du = i.member?.user ?? i.user;
  const discordUser = du?.id ?? "";
  const me = seatbitUserFor(discordUser);
  const names = discordNames(du, i.member?.nick);
  const all = guestSuggestions(c.id, me?.id ?? null, names, discordUser);
  const openClan = linkButton(t("bot.openClan"), `${appUrl}/clans/${c.slug}`);

  if (!guestId) {
    if (!all.length) return { response: reply(t("bot.noGuests", { clan: `**${c.name}**` }), { components: [openClan] }) };
    const matches = all.filter((s) => s.match && s.status !== "dismissed").slice(0, 5);
    if (!matches.length)
      return {
        response: reply(t("bot.noGuestMatch", { clan: `**${c.name}**` })),
      };
    const lines = matches.map(
      (s) =>
        `• **${s.guest.name}** ${t(s.match === "nick" ? "notice.sameNick" : "notice.sameName")}${s.status === "pending" ? ` · ${t("bot.waitingAdmin")}` : s.status === "declined" ? ` · ${t("bot.adminSaidNo")}` : ""}`,
    );
    return {
      response: reply(`${t("bot.lookLikeYou", { clan: `**${c.name}**` })}\n${lines.join("\n")}\n\n${t("bot.isOneYou")}`, {
        components: [
          {
            type: 1,
            components: matches.map((s) => ({ type: 2, style: 3, label: clip(t("bot.thatsMe", { name: s.guest.name }), 80), custom_id: `claim:${s.guest.id}` })),
          },
        ],
      }),
    };
  }

  const s = all.find((x) => x.guest.id === guestId);
  if (!s) return { response: reply(t("bot.guestNotFree"), { components: [openClan] }) };
  const g = s.guest;

  if (!me) {
    // No Seatbit account behind this Discord user yet: the link signs them in and continues there.
    const ticket = discordClaimTicket({ d: discordUser, g: g.id, c: c.id, m: s.match });
    return {
      response: reply(t("bot.signInToClaim", { guest: `**${g.name}**`, clan: `**${c.name}**` }), {
        components: [linkButton(t("bot.signInAndClaim"), `${appUrl}/claim/discord/${ticket}`)],
      }),
    };
  }
  if (s.status === "pending")
    return { response: reply(t("bot.alreadyAsked", { guest: `**${g.name}**`, clan: `**${c.name}**` })) };
  if (!profileComplete(me))
    return {
      response: reply(t("bot.finishProfile"), {
        components: [linkButton(t("bot.openSeatbit"), `${appUrl}/welcome`)],
      }),
    };
  const r = claimOrRequestGuest(c, s, me, "discord");
  return {
    response: reply(
      r === "claimed"
        ? `🎉 ${t("bot.claimed", { guest: `**${g.name}**` })}`
        : `👍 ${t("bot.askedAdmins", { guest: `**${g.name}**`, clan: `**${c.name}**` })}`,
      { components: [openClan] },
    ),
  };
}

type GuildMember = { user: DiscordUser; nick?: string | null };

/** Discord user ids of the clan's members on Seatbit (pending join requests not counted). */
function clanDiscordIds(clanId: string) {
  return new Set(
    db
      .select({ id: account.accountId })
      .from(account)
      .innerJoin(schema.clanMember, eq(schema.clanMember.userId, account.userId))
      .where(and(eq(account.providerId, "discord"), eq(schema.clanMember.clanId, clanId)))
      .all()
      .map((r) => r.id),
  );
}

/**
 * Suggestions for /guest member:<…>: people on the server who aren't in the clan on
 * Seatbit yet, found by what the lead typed, or by the picked guest's name before they type.
 */
async function memberChoices(i: Interaction): Promise<Json> {
  const none = { type: 8, data: { choices: [] } };
  const c = clanForGuild(i.guild_id);
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  if (!c || !i.guild_id || !me || !clanCan(me, c.id, "members")) return none;
  const typed = String(i.data?.options?.find((o) => o.name === "member")?.value ?? "").trim();
  const guestId = String(i.data?.options?.find((o) => o.name === "guest")?.value ?? "");
  const g = guestId ? claimableGuests(c.id, null).find((x) => x.id === guestId) : undefined;
  const query = typed || g?.firstName || "";
  let found: GuildMember[] = [];
  try {
    // Search works without the Server Members intent; the plain list (nothing typed yet) needs it and may fail.
    found = await api<GuildMember[]>(
      "GET",
      query ? `/guilds/${i.guild_id}/members/search?query=${encodeURIComponent(query)}&limit=50` : `/guilds/${i.guild_id}/members?limit=100`,
    );
  } catch (e) {
    if (query) console.warn("[discord] member search failed", (e as Error).message);
  }
  const inClan = clanDiscordIds(c.id);
  const choices = found
    .filter((m) => !m.user.bot && !inClan.has(m.user.id))
    .slice(0, 25)
    .map((m) => {
      const shown = m.nick || m.user.global_name || m.user.username || m.user.id;
      return { name: clip(m.user.username && shown !== m.user.username ? `${shown} (@${m.user.username})` : shown, 100), value: m.user.id };
    });
  return { type: 8, data: { choices } };
}

/**
 * /guest member:<@…> guest:<…>: a lead ties a guest to a Discord member. If that member
 * already has Seatbit, the guest moves over now; otherwise their Discord sign-in takes it
 * over, and the bot DMs them the claim link.
 */
function linkGuestCommand(
  i: Interaction,
  t: T,
  editReply: (body: Json) => Promise<unknown>,
): { response: Json; later?: () => Promise<void> } {
  const c = clanForGuild(i.guild_id);
  if (!c) return { response: reply(t("bot.serverNotLinked")) };
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  if (!me) return { response: notLinked(t) };
  if (!clanCan(me, c.id, "members")) return { response: reply(t("bot.onlyMemberAdmins", { clan: `**${c.name}**` })) };
  const targetId = String(i.data?.options?.find((o) => o.name === "member")?.value ?? "");
  const guestId = String(i.data?.options?.find((o) => o.name === "guest")?.value ?? "");
  // The member option is free text with suggestions; only a picked suggestion is a Discord user id.
  if (!/^\d{15,21}$/.test(targetId)) return { response: reply(t("bot.pickMember")) };
  const g = claimableGuests(c.id, null, null, { includeLinked: true }).find((x) => x.id === guestId);
  if (!g) return { response: reply(t("bot.guestTaken", { clan: `**${c.name}**` })) };
  const mention = `<@${targetId}>`;
  const existing = seatbitUserFor(targetId);

  if (existing && !existing.isGuest) {
    audit({ actorId: me.id, action: "guest.merged", clanId: c.id, targetUserId: existing.id, data: { guest: g.name, via: "discord" } });
    mergeGuestInto(g, existing.id);
    notifyLater(() =>
      notify(existing.id, (t) => ({
        kind: "guest_linked",
        subject: t("notice.tookOver", { guest: g.name, clan: c.name }),
        text: `${t("notice.linkedText", { guest: g.name, clan: c.name })}\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      })),
    );
    return { response: reply(`👍 ${t("bot.merged", { member: mention, guest: `**${g.name}**` })}`) };
  }

  const same = g.guestDiscordId === targetId;
  if (!same) {
    // One guest per Discord member and clan: a new link replaces an older one.
    db.update(user)
      .set(UNLINKED)
      .where(and(eq(user.guestClanId, c.id), eq(user.guestDiscordId, targetId)))
      .run();
    db.update(user)
      .set({ ...UNLINKED, guestDiscordId: targetId, guestDiscordLinkedAt: new Date(), guestDiscordLinkedBy: me.id })
      .where(eq(user.id, g.id))
      .run();
    audit({
      actorId: me.id,
      action: "guest.discord_link",
      clanId: c.id,
      targetUserId: g.id,
      data: { guest: g.name, relinked: !!g.guestDiscordId },
    });
  }
  const link = `${appUrl}/claim/${g.claimCode}`;
  return {
    response: { type: 5, data: { flags: EPHEMERAL } },
    later: async () => {
      if (!same && i.guild_id) {
        const name = await discordMemberName(i.guild_id, targetId);
        if (name) db.update(user).set({ guestDiscordName: name }).where(eq(user.id, g.id)).run();
      }
      const dm = await sendGuestDiscordDm(g.id);
      const vars = { member: mention, guest: `**${g.name}**`, link };
      const what = same ? t("bot.linkedAlready", vars) : `👍 ${t("bot.linkedNow", vars)}`;
      await editReply({
        content: `${what} ${dm.ok ? t(same ? "bot.dmedAgain" : "bot.dmed") : t("bot.couldntDm", vars)}`,
        allowed_mentions: { parse: [] },
      }).catch((e) => console.error("[discord] guest link reply failed", e));
    },
  };
}

/** Clears a guest's Discord link and what we noted about it. */
export const UNLINKED = { guestDiscordId: null, guestDiscordName: null, guestDiscordLinkedAt: null, guestDiscordLinkedBy: null, guestDiscordDmAt: null };

/** "Nick (@username)" of a server member, or null when Discord won't say. */
async function discordMemberName(guildId: string, userId: string) {
  try {
    const m = await api<GuildMember>("GET", `/guilds/${guildId}/members/${userId}`);
    const shown = m.nick || m.user.global_name || m.user.username;
    return clip(m.user.username && shown !== m.user.username ? `${shown} (@${m.user.username})` : `@${shown}`, 100);
  } catch {
    return null;
  }
}

/**
 * DMs the Discord member a lead linked a guest to the guest's claim link (again), and
 * notes when it went out. Used by /guest and the "Send the DM again" button on the guest page.
 */
export async function sendGuestDiscordDm(guestId: string): Promise<DmResult> {
  const g = db.select().from(user).where(eq(user.id, guestId)).get();
  if (!g?.isGuest || !g.guestDiscordId || !g.claimCode) return { ok: false, problem: "no_discord" };
  const c = g.guestClanId ? getClan(g.guestClanId) : undefined;
  // A guest has no profile yet: the clan's language decides.
  const t = makeT(clanLocale(c));
  const clanName = c?.name ?? t("mail.yourClan");
  const dm = await dmDiscordUser(g.guestDiscordId, {
    kind: "guest_linked",
    locale: t.locale,
    subject: t("notice.spotWaiting", { clan: clanName }),
    text: t("notice.spotWaitingText", { clan: clanName, guest: g.name }),
    url: `${appUrl}/claim/${g.claimCode}`,
    footer: t("notice.linkedFooter"),
  });
  if (dm.ok) db.update(user).set({ guestDiscordDmAt: new Date() }).where(eq(user.id, g.id)).run();
  return dm;
}

/** Unlinks a channel from Seatbit (clan settings). Checks the caller may manage the channel's clan. */
export function unlinkChannel(u: { id: string; role: string }, channelId: string) {
  const ch = db.select().from(discordChannel).where(eq(discordChannel.channelId, channelId)).get();
  if (!ch || !clanCan(u, ch.clanId, "settings")) return false;
  db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
  db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
  return true;
}
