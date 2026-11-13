import crypto from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { INTEREST_ANSWERS, type AttendanceStatus, type Clan, type InterestAnswer, type Lan } from "@/db/schema";
import { avatarUrl, clanCan, getClan, isClanMember, myClans } from "./clans";
import { roleCan } from "./clan-roles";
import { type ChatReminderKind, fmtWhen, lanFacts, lanLink, lanSummary } from "./announce";
import { ATTENDANCE_LOCKED_MSG, attendanceLocked, getDisplayNames, getLan, setAttendance, signupClosed, waitlistPositions } from "./lans";
import { type Json, api, discordEnabled } from "./discord-api";
import type { DiscordMode } from "./discord-modes";
import { getSetting } from "./settings";
import { setSeatBooked } from "./seat-booking";
import { appUrl } from "./mail";
import { audit } from "./audit";
import { claimableGuests, claimOrRequestGuest, discordClaimTicket, guestSuggestions, mergeGuestInto } from "./guest-claim";
import { nameMatches } from "./names";
import { dmDiscordUser, notify, notifyLater } from "./notify";

const { discordChannel, discordMessage, channelReminderLog, account, attendance, lan, user } = schema;

const appId = () => getSetting("discord.clientId");
const profileComplete = (u: { firstName: string; lastName: string }) => !!(u.firstName && u.lastName);

// ---------- Request verification ----------

// DER prefix that turns a raw 32-byte Ed25519 key into an SPKI public key.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Checks Discord's Ed25519 signature on an interaction request. */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null) {
  const publicKey = getSetting("discord.publicKey");
  if (!publicKey || !signature || !timestamp) return false;
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
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const list = (names: string[]) => clip(names.join(", ") || "—", 1024);

/** Discord user ids of members who linked their Discord account, by Seatbit user id. */
function discordIds(): Map<string, string> {
  const rows = db.select().from(account).where(eq(account.providerId, "discord")).all();
  return new Map(rows.map((r) => [r.userId, r.accountId]));
}

function attendanceButtons(l: Lan, disabled = false) {
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
        btn("going", "Coming", 3),
        btn("maybe", "Unsure", 2),
        btn("declined", "Not coming", 4),
        { type: 2, style: 5, label: "Open in Seatbit", url: lanLink(l) },
      ],
    },
  ];
}

/** "⏰ Next: buy ticket by Sat 14.11.2026, 18:00", or "" when nothing is due anymore. */
function nextDeadline(l: Lan, now = new Date()) {
  const next = (
    [
      ["Answer by", l.signupDeadline],
      ["Buy ticket by", l.paymentDueDate],
      ["Starts", l.startsAt],
    ] as const
  ).find(([, d]) => d && d > now);
  return next ? `⏰ Next: ${next[0]} ${fmtWhen(next[1]!)}` : "";
}

/** Interest check buttons: would you come? */
function interestButtons(l: Lan) {
  const btn = (a: InterestAnswer, label: string, style: number) => ({ type: 2, style, label, custom_id: `int:${l.id}:${a}` });
  return [
    {
      type: 1,
      components: [
        btn("yes", "I'd come", 3),
        btn("maybe", "Maybe", 2),
        btn("no", "Not this time", 4),
        { type: 2, style: 5, label: "Open in Seatbit", url: lanLink(l) },
      ],
    },
  ];
}

/** The interest check post: who'd come, who maybe. */
async function interestMessage(l: Lan) {
  const rows = db.select().from(schema.lanInterest).where(eq(schema.lanInterest.lanId, l.id)).all();
  const names = await getDisplayNames(l.id, rows.map((r) => r.userId));
  const who = (a: string) => rows.filter((r) => r.answer === a).map((r) => names.get(r.userId) ?? "?").sort((x, y) => x.localeCompare(y));
  const yes = who("yes");
  const maybe = who("maybe");
  const c = l.clanId ? getClan(l.clanId) : undefined;
  const icon = c && avatarUrl(c);
  const fields = lanFacts(l).map(([name, value]) => ({ name, value: clip(value, 1024), inline: true }));
  fields.push({ name: `Would come (${yes.length})`, value: list(yes), inline: false });
  if (maybe.length) fields.push({ name: `Maybe (${maybe.length})`, value: list(maybe), inline: false });
  return {
    embeds: [
      {
        author: c ? { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined } : undefined,
        title: clip(`Would you come? ${l.name}`, 256),
        url: lanLink(l),
        description: clip(l.description, 1500) || undefined,
        color: BRAND,
        fields,
        footer: { text: "Interest check, not binding. Sign-up opens once the orgas decide." },
      },
    ],
    components: interestButtons(l),
    allowed_mentions: { parse: [] },
  };
}

/** The LAN announcement: details, live attendee list and attendance buttons. */
export async function lanMessage(l: Lan) {
  if (l.interestCheck && !l.cancelledAt) return interestMessage(l);
  const s = await lanSummary(l);
  const closed = !!signupClosed(l);
  const fields = lanFacts(l).map(([name, value]) => ({ name, value: clip(value, 1024), inline: true }));
  fields.push({
    name: `Coming (${s.going.length}${l.capacity ? `/${l.capacity}` : ""})`,
    value: list(s.going.map((g) => g.name)),
    inline: false,
  });
  if (s.maybe.length) fields.push({ name: `Unsure (${s.maybe.length})`, value: list(s.maybe.map((g) => g.name)), inline: false });
  if (s.waitlist.length)
    fields.push({ name: `Waitlist (${s.waitlist.length}, in order)`, value: list(s.waitlist.map((g, i) => `${i + 1}. ${g.name}`)), inline: false });
  // Live status: tickets, seat bookings and what's due next.
  const status = [
    s.going.length ? `🎟️ Tickets: **${s.going.length - s.goingNoTicket}/${s.going.length}**` : "",
    s.seated ? `💺 Seats booked on the event site: **${s.booked}/${s.seated}**` : "",
    nextDeadline(l),
  ].filter(Boolean);
  if (status.length) fields.push({ name: "Status", value: clip(status.join("\n"), 1024), inline: false });
  const c = l.clanId ? getClan(l.clanId) : undefined;
  const icon = c && avatarUrl(c);
  return {
    embeds: [
      {
        author: c ? { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined } : undefined,
        title: clip(l.cancelledAt ? `❌ Cancelled: ${l.name}` : l.name, 256),
        url: lanLink(l),
        description: clip(l.cancelledAt ? l.cancelReason || "The orgas cancelled this event." : l.description, 1500) || undefined,
        color: l.cancelledAt ? 0xef4444 : BRAND,
        fields,
        footer: { text: l.cancelledAt ? "This event is cancelled" : closed ? "Sign-up is closed" : "Tap a button to set your status" },
      },
    ],
    components: l.cancelledAt ? [] : attendanceButtons(l, closed),
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
        title: `⏰ Are you coming? ${l.name}`,
        description: `Please say if you're coming by **${fmtWhen(l.signupDeadline!)}**.`,
        color: AMBER,
        fields: [{ name: `Still waiting on (${who.length})`, value: list(who) }],
      };
      break;
    case "payment":
      embed = {
        title: `🎟️ Buy your ticket: ${l.name}`,
        description: `Buy your ticket by **${fmtWhen(l.paymentDueDate!)}** and tick it off in Seatbit.`,
        color: AMBER,
        fields: [
          ...(l.ticketUrl ? [{ name: "Ticket shop", value: clip(l.ticketUrl, 1024), inline: true }] : []),
          ...(l.price ? [{ name: "Price", value: clip(l.price, 1024), inline: true }] : []),
          { name: `Still open for (${who.length})`, value: list(who) },
        ],
      };
      break;
    case "event":
      embed = {
        title: `🚀 Starts soon: ${l.name}`,
        description: "See you there!",
        color: BRAND,
        fields: [
          { name: "When", value: fmtWhen(l.startsAt), inline: true },
          ...(l.location ? [{ name: "Where", value: clip(l.location, 1024), inline: true }] : []),
          { name: `Coming (${who.length})`, value: list(who) },
        ],
      };
      break;
  }
  const buttons =
    kind === "signup"
      ? attendanceButtons(l)
      : [
          {
            type: 1,
            components: [
              ...(kind === "payment" && l.ticketUrl ? [{ type: 2, style: 5, label: "Buy ticket", url: l.ticketUrl }] : []),
              { type: 2, style: 5, label: "Open in Seatbit", url: lanLink(l) },
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
        footer: unlinked ? { text: `${unlinked} member(s) without a linked Discord account aren't pinged.` } : undefined,
      },
    ],
    components: buttons,
    allowed_mentions: { users: linked.slice(0, 100) },
  };
}

/** Orga news as an embed, for the event's thread or channel. */
function newsMessage(l: Lan, text: string, author: string) {
  return {
    embeds: [
      {
        author: clanAuthor(l),
        title: clip(`📣 News: ${l.name}`, 256),
        url: lanLink(l),
        description: clip(text, 4000),
        color: BRAND,
        footer: { text: clip(`From ${author}`, 2048) },
      },
    ],
    components: [linkButton("Open in Seatbit", lanLink(l))],
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
      content: `📣 **${clip(l.name, 200)}** has its own channel: <#${eventChannelId}>`,
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
  // Drafts stay off Discord until an orga publishes them.
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

/** Posts a reminder to every channel now (orga "nudge" button). */
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
 * Posts orga news in the event's own thread or channel. Events in the plain channel mode don't get it
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

type Option = { name: string; type?: number; value?: string; focused?: boolean; options?: Option[] };

type Interaction = {
  type: number;
  id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  channel?: { name?: string };
  member?: { user: DiscordUser; nick?: string | null };
  user?: DiscordUser;
  data?: {
    name?: string;
    custom_id?: string;
    options?: Option[];
    resolved?: { users?: Record<string, DiscordUser>; members?: Record<string, { nick?: string | null }> };
  };
};

type DiscordUser = { id: string; username?: string; global_name?: string | null; bot?: boolean };

const EPHEMERAL = 64;
const reply = (content: string, extra: Json = {}) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra },
});
const linkButton = (label: string, url: string) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });

const statusLabel: Record<AttendanceStatus, string> = {
  going: "✅ You're in",
  maybe: "🤔 Marked as unsure",
  declined: "❌ Marked as not coming",
  waitlist: "⏳ It's full, you're on the waitlist",
};

/** The Seatbit user behind a Discord account, if they linked it. */
function seatbitUserFor(discordUserId: string) {
  const userId = db
    .select()
    .from(account)
    .where(and(eq(account.providerId, "discord"), eq(account.accountId, discordUserId)))
    .get()?.userId;
  return userId ? db.select().from(user).where(eq(user.id, userId)).get() : undefined;
}

const notLinked = () =>
  reply("I don't know who you are in Seatbit yet. Sign in with Discord, or link Discord on your profile, then try again.", {
    components: [linkButton("Link Discord", `${appUrl}/profile`)],
  });

/** The clan a Discord server is linked to (all its channels share one clan). */
function clanForGuild(guildId: string | undefined): Clan | undefined {
  if (!guildId) return undefined;
  const ch = db.select().from(discordChannel).where(eq(discordChannel.guildId, guildId)).get();
  return ch ? getClan(ch.clanId) : undefined;
}

/** Clans this user may link a server to: only clans they're an admin of (platform admins included). */
function manageableClans(u: { id: string; role: string }) {
  return myClans(u.id)
    .filter((m) => u.role === "admin" || roleCan(m.role, "settings"))
    .map((m) => m.clan);
}

const upcomingLans = (clanIds: string[]) =>
  clanIds.length
    ? db
        .select()
        .from(lan)
        .where(and(gt(lan.endsAt, new Date()), inArray(lan.clanId, clanIds), isNotNull(lan.publishedAt)))
        .orderBy(asc(lan.startsAt))
        .all()
    : [];

/**
 * Handles a verified interaction. Returns the immediate response, plus an
 * optional task to run after responding (Discord wants an answer within 3s).
 */
export function handleInteraction(i: Interaction): { response: Json | Promise<Json>; later?: () => Promise<void> } {
  if (i.type === 1) return { response: { type: 1 } }; // PING

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
    // /claim: what's still free for the caller; /guest (orgas): only guests nobody asked for or got linked to yet.
    const me = i.data.name === "claim" ? seatbitUserFor(discordUser) : undefined;
    const free = c ? (i.data.name === "claim" ? claimableGuests(c.id, me?.id ?? null, discordUser) : claimableGuests(c.id, null)) : [];
    const choices = free
      .filter((g) => !q || nameMatches(g.name, q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 25)
      .map((g) => ({ name: clip(g.name, 100), value: g.id }));
    return { response: { type: 8, data: { choices } } };
  }

  // Autocomplete for /seatbit here clan:<…>
  if (i.type === 4 && i.data?.name === "seatbit") {
    const me = seatbitUserFor(discordUser);
    const q = (sub?.options?.find((o) => o.focused)?.value ?? "").toLowerCase();
    const choices = (me ? manageableClans(me) : [])
      .filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q))
      .slice(0, 25)
      .map((c) => ({ name: clip(c.name, 100), value: c.slug }));
    return { response: { type: 8, data: { choices } } };
  }

  // "I booked it" button in seat DMs: the member booked their seat on the event's own seat plan.
  if (i.type === 3 && i.data?.custom_id?.startsWith("booked:")) {
    const l = getLan(i.data.custom_id.slice("booked:".length));
    if (!l) return { response: reply("This LAN doesn't exist anymore.") };
    const me = seatbitUserFor(discordUser);
    if (!me) return { response: notLinked() };
    try {
      const label = setSeatBooked(l.id, me.id, true);
      return {
        response: reply(`👍 Noted: you booked seat **${label}** for **${l.name}**. Thanks!`, {
          components: [linkButton("Open in Seatbit", lanLink(l))],
        }),
      };
    } catch (e) {
      return { response: reply((e as Error).message, { components: [linkButton("Open in Seatbit", lanLink(l))] }) };
    }
  }

  // Interest check button
  if (i.type === 3 && i.data?.custom_id?.startsWith("int:")) {
    const [, lanId, answer] = i.data.custom_id.split(":") as [string, string, InterestAnswer];
    const l = getLan(lanId);
    if (!l) return { response: reply("This LAN doesn't exist anymore.") };
    if (!l.interestCheck || l.cancelledAt) return { response: reply("The interest check is over.", { components: [linkButton("Open in Seatbit", lanLink(l))] }) };
    if (!INTEREST_ANSWERS.includes(answer)) return { response: reply("Unknown button.") };
    const me = seatbitUserFor(discordUser);
    if (!me) return { response: notLinked() };
    if (!l.clanId || !isClanMember(me.id, l.clanId)) return { response: reply("This LAN is for members of another clan.") };
    db.insert(schema.lanInterest)
      .values({ lanId: l.id, userId: me.id, answer })
      .onConflictDoUpdate({ target: [schema.lanInterest.lanId, schema.lanInterest.userId], set: { answer } })
      .run();
    refreshLanMessagesSoon(l.id);
    const text = { yes: "👍 Noted: you'd come", maybe: "🤔 Noted: maybe", no: "👋 Noted: not this time" }[answer];
    return { response: reply(`${text} for **${l.name}**. We'll tell you when sign-up opens.`) };
  }

  // Attendance button
  if (i.type === 3 && i.data?.custom_id?.startsWith("att:")) {
    const [, lanId, status] = i.data.custom_id.split(":") as [string, string, AttendanceStatus];
    const l = getLan(lanId);
    if (!l) return { response: reply("This LAN doesn't exist anymore.") };
    if (signupClosed(l)) return { response: reply("Sign-up for this LAN is closed. Ask an orga if something changed.") };
    if (!["going", "maybe", "declined"].includes(status)) return { response: reply("Unknown button.") };
    const me = seatbitUserFor(discordUser);
    if (!me) return { response: notLinked() };
    const mine = db.select().from(attendance).where(and(eq(attendance.lanId, l.id), eq(attendance.userId, me.id))).get();
    if (attendanceLocked(mine)) return { response: reply(ATTENDANCE_LOCKED_MSG, { components: [linkButton("Open in Seatbit", lanLink(l))] }) };
    if (!l.clanId || !isClanMember(me.id, l.clanId)) {
      const c = l.clanId ? getClan(l.clanId) : undefined;
      return {
        response: reply(`This LAN is for members of **${c?.name ?? "another clan"}**. Ask to join the clan in Seatbit first.`, {
          components: c ? [linkButton("Open clan", `${appUrl}/clans/${c.slug}`)] : [],
        }),
      };
    }
    return {
      response: { type: 5, data: { flags: EPHEMERAL } }, // "thinking…", answered below
      later: async () => {
        try {
          const stored = await setAttendance(l, me.id, status);
          const extra =
            stored === "going"
              ? " Tick off your ticket in Seatbit once you have it."
              : stored === "waitlist"
                ? ` You're #${waitlistPositions(l.id).get(me.id) ?? "?"} in line; you get a DM when you move up.`
                : "";
          await editReply({
            content: `${statusLabel[stored]} for **${l.name}**.${extra}`,
            components: [linkButton("Open in Seatbit", lanLink(l))],
          });
        } catch (e) {
          console.error("[discord] attendance failed", e);
          await editReply({ content: "Something went wrong, please try again in Seatbit." }).catch(() => {});
        }
      },
    };
  }

  // /claim [guest:<…>], and the "That's me" buttons it shows
  if (i.type === 2 && i.data?.name === "claim") {
    const wanted = i.data.options?.find((o) => o.name === "guest")?.value;
    return claimCommand(i, wanted ? String(wanted) : undefined);
  }
  if (i.type === 3 && i.data?.custom_id?.startsWith("claim:")) {
    return claimCommand(i, i.data.custom_id.slice("claim:".length));
  }

  // /guest member:<@…> guest:<…>: an orga says who a guest is
  if (i.type === 2 && i.data?.name === "guest") return linkGuestCommand(i, editReply);

  // /lans: this server's clan, or (in DMs / unlinked servers) all of your clans
  if (i.type === 2 && i.data?.name === "lans") {
    const me = seatbitUserFor(discordUser);
    const serverClan = clanForGuild(i.guild_id);
    const clanIds = serverClan ? [serverClan.id] : me ? myClans(me.id).filter((m) => m.role !== "pending").map((m) => m.clan.id) : [];
    if (!serverClan && !me) return { response: notLinked() };
    const upcoming = upcomingLans(clanIds).slice(0, 5);
    if (upcoming.length === 0) return { response: reply(`No upcoming LANs${serverClan ? ` for ${serverClan.name}` : ""} right now.`) };
    const mine = me
      ? new Map(db.select().from(attendance).where(eq(attendance.userId, me.id)).all().map((a) => [a.lanId, a.status]))
      : new Map<string, AttendanceStatus>();
    const label: Record<string, string> = { going: "coming", maybe: "unsure", declined: "not coming", waitlist: "waitlist" };
    const lines = upcoming.map(
      (l) => `**[${l.name}](<${lanLink(l)}>)** · ${fmtWhen(l.startsAt)}${me ? ` · you: ${label[mine.get(l.id) ?? ""] ?? "no answer"}` : ""}`,
    );
    return {
      response: reply(lines.join("\n") + (me ? "" : "\n\n-# Link Discord on your Seatbit profile to answer from here."), {
        components: upcoming
          .filter((l) => !signupClosed(l))
          .slice(0, 4)
          .map((l) => ({
            type: 1,
            components: [
              { type: 2, style: 3, label: clip(`Coming: ${l.name}`, 80), custom_id: `att:${l.id}:going` },
              { type: 2, style: 2, label: "Unsure", custom_id: `att:${l.id}:maybe` },
              { type: 2, style: 4, label: "Not coming", custom_id: `att:${l.id}:declined` },
            ],
          })),
      }),
    };
  }

  // /seatbit here|stop|announce (Discord only shows it to members with Manage Server)
  if (i.type === 2 && i.data?.name === "seatbit") {
    if (!i.guild_id || !i.channel_id) return { response: reply("Use this in a server channel.") };
    const guildId = i.guild_id;
    const channelId = i.channel_id;

    if (sub?.name === "here") {
      const me = seatbitUserFor(discordUser);
      if (!me) return { response: notLinked() };
      const mine = manageableClans(me);
      if (mine.length === 0) {
        return {
          response: reply("You need to be an admin of a clan in Seatbit to link this server. Create one or ask your clan admin.", {
            components: [linkButton("Open Seatbit", appUrl)],
          }),
        };
      }
      const wanted = sub.options?.find((o) => o.name === "clan")?.value;
      const target = wanted ? mine.find((c) => c.slug === wanted) : mine.length === 1 ? mine[0] : undefined;
      if (!target) {
        return {
          response: reply(
            wanted
              ? "You can't manage that clan."
              : `You manage several clans. Pick one: \`/seatbit here clan:\` (${mine.map((c) => c.name).join(", ")}).`,
          ),
        };
      }
      const existing = clanForGuild(guildId);
      if (existing && existing.id !== target.id) {
        return {
          response: reply(`This server is already linked to **${existing.name}**. Run \`/seatbit stop\` in its channels first.`),
        };
      }
      db.insert(discordChannel)
        .values({ clanId: target.id, guildId, channelId, channelName: i.channel?.name ?? "", addedBy: discordUser })
        .onConflictDoUpdate({ target: discordChannel.channelId, set: { clanId: target.id, channelName: i.channel?.name ?? "" } })
        .run();
      return {
        response: reply(
          `👍 This channel now gets **${target.name}**'s new LANs, deadline reminders and live attendee lists. Use \`/seatbit announce\` to post the upcoming ones now.`,
        ),
      };
    }

    if (sub?.name === "stop") {
      db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
      db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
      return { response: reply("OK, I won't post in this channel anymore.") };
    }

    if (sub?.name === "announce") {
      const known = db.select().from(discordChannel).where(eq(discordChannel.channelId, channelId)).get();
      if (!known) return { response: reply("Run `/seatbit here` in this channel first.") };
      return {
        response: { type: 5, data: { flags: EPHEMERAL } },
        later: async () => {
          let n = 0;
          for (const l of upcomingLans([known.clanId])) n += await announceLan(l.id, channelId);
          await editReply({ content: n ? `Posted ${n} LAN(s).` : "All upcoming LANs are already posted here." });
        },
      };
    }
  }

  return { response: reply("Unknown command.") };
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
function claimCommand(i: Interaction, guestId?: string): { response: Json } {
  const c = clanForGuild(i.guild_id);
  if (!c) return { response: reply("This server isn't linked to a clan in Seatbit yet. Ask your clan admin to run `/seatbit here`.") };
  if (c.guestClaims === "off")
    return { response: reply(`In **${c.name}**, guests are taken over through their own link. Ask an admin for yours.`) };
  const du = i.member?.user ?? i.user;
  const discordUser = du?.id ?? "";
  const me = seatbitUserFor(discordUser);
  const names = discordNames(du, i.member?.nick);
  const all = guestSuggestions(c.id, me?.id ?? null, names, discordUser);
  const openClan = linkButton("Open clan", `${appUrl}/clans/${c.slug}`);

  if (!guestId) {
    if (!all.length) return { response: reply(`**${c.name}** has no guests waiting to be taken over.`, { components: [openClan] }) };
    const matches = all.filter((s) => s.match && s.status !== "dismissed").slice(0, 5);
    if (!matches.length)
      return {
        response: reply(`I didn't find a guest in **${c.name}** with your name or nick. Pick yours with \`/claim guest:\`.`),
      };
    const lines = matches.map(
      (s) => `• **${s.guest.name}** (same ${s.match})${s.status === "pending" ? " · waiting for an admin" : s.status === "declined" ? " · an admin said no" : ""}`,
    );
    return {
      response: reply(`These guests in **${c.name}** look like you:\n${lines.join("\n")}\n\nIs one of them you?`, {
        components: [
          {
            type: 1,
            components: matches.map((s) => ({ type: 2, style: 3, label: clip(`That's me: ${s.guest.name}`, 80), custom_id: `claim:${s.guest.id}` })),
          },
        ],
      }),
    };
  }

  const s = all.find((x) => x.guest.id === guestId);
  if (!s) return { response: reply("That guest was taken over already, someone else asked for it, or it belongs to another clan.", { components: [openClan] }) };
  const g = s.guest;

  if (!me) {
    // No Seatbit account behind this Discord user yet: the link signs them in and continues there.
    const ticket = discordClaimTicket({ d: discordUser, g: g.id, c: c.id, m: s.match });
    return {
      response: reply(
        `Sign in to Seatbit with this Discord account to take over **${g.name}** in **${c.name}**. The link works for 24 hours.`,
        { components: [linkButton("Sign in and take it over", `${appUrl}/claim/discord/${ticket}`)] },
      ),
    };
  }
  if (s.status === "pending")
    return { response: reply(`You already asked to take over **${g.name}**. An admin of **${c.name}** will confirm it.`) };
  if (!profileComplete(me))
    return {
      response: reply("Finish your Seatbit profile first (first name and surname), then try again.", {
        components: [linkButton("Open Seatbit", `${appUrl}/welcome`)],
      }),
    };
  const r = claimOrRequestGuest(c, s, me, "discord");
  return {
    response: reply(
      r === "claimed"
        ? `🎉 Done: **${g.name}** is you now. Their events, seat and nicks moved to your account.`
        : `👍 Asked the admins of **${c.name}** to confirm you're **${g.name}**. I'll DM you when they did.`,
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
 * Seatbit yet, found by what the orga typed, or by the picked guest's name before they type.
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
 * /guest member:<@…> guest:<…>: an orga ties a guest to a Discord member. If that member
 * already has Seatbit, the guest moves over now; otherwise their Discord sign-in takes it
 * over, and the bot DMs them the claim link.
 */
function linkGuestCommand(i: Interaction, editReply: (body: Json) => Promise<unknown>): { response: Json; later?: () => Promise<void> } {
  const c = clanForGuild(i.guild_id);
  if (!c) return { response: reply("This server isn't linked to a clan in Seatbit yet. Run `/seatbit here` first.") };
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  if (!me) return { response: notLinked() };
  if (!clanCan(me, c.id, "members")) return { response: reply(`Only admins of **${c.name}** who manage members can do this.`) };
  const targetId = String(i.data?.options?.find((o) => o.name === "member")?.value ?? "");
  const guestId = String(i.data?.options?.find((o) => o.name === "guest")?.value ?? "");
  // The member option is free text with suggestions; only a picked suggestion is a Discord user id.
  if (!/^\d{15,21}$/.test(targetId)) return { response: reply("Pick the member from the suggestions while you type their name.") };
  const g = claimableGuests(c.id, null).find((x) => x.id === guestId);
  if (!g) return { response: reply(`That guest isn't free anymore in **${c.name}**: taken over, already asked for (approve or decline it under Members in Seatbit), or linked to someone. Pick one from the list.`) };
  const mention = `<@${targetId}>`;
  const existing = seatbitUserFor(targetId);

  if (existing && !existing.isGuest) {
    audit({ actorId: me.id, action: "guest.merged", clanId: c.id, targetUserId: existing.id, data: { guest: g.name, via: "discord" } });
    mergeGuestInto(g, existing.id);
    notifyLater(() =>
      notify(existing.id, {
        kind: "guest_linked",
        subject: `You took over ${g.name} in ${c.name}`,
        text: `An admin of ${c.name} said you're ${g.name}. Their events, seats and nicks are yours now.\n\n${appUrl}/clans/${c.slug}`,
        url: `${appUrl}/clans/${c.slug}`,
      }),
    );
    return { response: reply(`👍 Done: ${mention} already has Seatbit, so **${g.name}** moved to their account.`) };
  }

  // One guest per Discord member and clan: a new link replaces an older one.
  db.update(user)
    .set({ guestDiscordId: null })
    .where(and(eq(user.guestClanId, c.id), eq(user.guestDiscordId, targetId)))
    .run();
  db.update(user).set({ guestDiscordId: targetId }).where(eq(user.id, g.id)).run();
  audit({ actorId: me.id, action: "guest.discord_link", clanId: c.id, targetUserId: g.id, data: { guest: g.name } });
  const link = `${appUrl}/claim/${g.claimCode}`;
  return {
    response: { type: 5, data: { flags: EPHEMERAL } },
    later: async () => {
      const dm = await dmDiscordUser(targetId, {
        kind: "guest_linked",
        subject: `Your spot in ${c.name} is waiting`,
        text: `The orgas of ${c.name} added you to Seatbit as ${g.name}. Sign in with this Discord account to see your events, tickets and seat.`,
        url: link,
        footer: "Seatbit · sent because an orga of your clan linked you",
      });
      await editReply({
        content: dm.ok
          ? `👍 Linked: ${mention} is **${g.name}**. I DMed them the link; signing in to Seatbit with Discord takes the guest over.`
          : `👍 Linked: ${mention} is **${g.name}**. Signing in to Seatbit with Discord takes the guest over. I couldn't DM them, so send them this link: ${link}`,
        allowed_mentions: { parse: [] },
      }).catch((e) => console.error("[discord] guest link reply failed", e));
    },
  };
}

/** Unlinks a channel from Seatbit (clan settings). Checks the caller may manage the channel's clan. */
export function unlinkChannel(u: { id: string; role: string }, channelId: string) {
  const ch = db.select().from(discordChannel).where(eq(discordChannel.channelId, channelId)).get();
  if (!ch || !clanCan(u, ch.clanId, "settings")) return false;
  db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
  db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
  return true;
}
