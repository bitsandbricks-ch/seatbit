import crypto from "node:crypto";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AttendanceStatus, Clan, Lan } from "@/db/schema";
import { avatarUrl, canManageClan, getClan, isClanMember, myClans } from "./clans";
import { type ChatReminderKind, fmtWhen, lanFacts, lanLink, lanSummary } from "./announce";
import { ATTENDANCE_LOCKED_MSG, attendanceLocked, getLan, setAttendance, signupClosed } from "./lans";
import { type Json, api, discordEnabled } from "./discord-api";
import { getSetting } from "./settings";
import { appUrl } from "./mail";

const { discordChannel, discordMessage, channelReminderLog, account, attendance, lan, user } = schema;

const appId = () => getSetting("discord.clientId");

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

/** The LAN announcement: details, live attendee list and attendance buttons. */
export async function lanMessage(l: Lan) {
  const s = await lanSummary(l);
  const closed = !!signupClosed(l);
  const fields = lanFacts(l).map(([name, value]) => ({ name, value: clip(value, 1024), inline: true }));
  fields.push({
    name: `Coming (${s.going.length}${l.capacity ? `/${l.capacity}` : ""})`,
    value: list(s.going.map((g) => g.nick)),
    inline: false,
  });
  if (s.maybe.length) fields.push({ name: `Unsure (${s.maybe.length})`, value: list(s.maybe.map((g) => g.nick)), inline: false });
  if (s.waitlist.length)
    fields.push({ name: `Waitlist (${s.waitlist.length})`, value: list(s.waitlist.map((g) => g.nick)), inline: false });
  const c = l.clanId ? getClan(l.clanId) : undefined;
  const icon = c && avatarUrl(c);
  return {
    embeds: [
      {
        author: c ? { name: clip(c.name, 256), url: `${appUrl}/clans/${c.slug}`, icon_url: icon ? `${appUrl}${icon}` : undefined } : undefined,
        title: clip(l.name, 256),
        url: lanLink(l),
        description: clip(l.description, 1500) || undefined,
        color: BRAND,
        fields,
        footer: { text: closed ? "Sign-up is closed" : "Tap a button to set your status" },
      },
    ],
    components: attendanceButtons(l, closed),
    allowed_mentions: { parse: [] },
  };
}

/** Reminder text for a channel, pinging linked members it applies to. */
async function reminderMessage(kind: ChatReminderKind, l: Lan) {
  const s = await lanSummary(l);
  const ids = discordIds();
  const ping = (users: { id: string }[]) => {
    const linked = users.map((u) => ids.get(u.id)).filter((x): x is string => !!x);
    return { mentions: linked.map((id) => `<@${id}>`).join(" "), users: linked, unlinked: users.length - linked.length };
  };
  // Nobody left to nudge: skip the post.
  if ((kind === "signup" && s.undecided.length === 0) || (kind === "payment" && s.noTicket.length === 0)) return null;
  if (kind === "event" && s.going.length === 0) return null;
  let text: string;
  let p: ReturnType<typeof ping>;
  switch (kind) {
    case "signup": {
      p = ping(s.undecided);
      text = `⏰ **${l.name}**: please say if you're coming by **${fmtWhen(l.signupDeadline!)}**. Still waiting on ${s.undecided.length}: ${p.mentions}`;
      break;
    }
    case "payment": {
      p = ping(s.noTicket);
      text = `🎟️ **${l.name}**: buy your ticket by **${fmtWhen(l.paymentDueDate!)}**${l.ticketUrl ? ` (<${l.ticketUrl}>)` : ""} and tick it off in Seatbit. Still open for ${s.noTicket.length}: ${p.mentions}`;
      break;
    }
    case "event": {
      p = ping(s.going.map((g) => ({ id: g.userId })));
      text = `🚀 **${l.name}** starts ${fmtWhen(l.startsAt)}${l.location ? ` at ${l.location}` : ""}. See you there! ${p.mentions}`;
      break;
    }
  }
  if (p.unlinked) text += `\n-# ${p.unlinked} member(s) without a linked Discord account aren't pinged.`;
  return {
    content: clip(text, 2000),
    components: kind === "signup" ? attendanceButtons(l) : [{ type: 1, components: [{ type: 2, style: 5, label: "Open in Seatbit", url: lanLink(l) }] }],
    allowed_mentions: { users: p.users.slice(0, 100) },
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

/**
 * Posts the LAN announcement to every configured channel that doesn't have it
 * yet, and refreshes it where it exists. Returns how many channels got a new post.
 */
export async function announceLan(lanId: string, onlyChannelId?: string) {
  if (!discordEnabled()) return 0;
  const l = getLan(lanId);
  if (!l) return 0;
  const msg = await lanMessage(l);
  const existing = new Set(
    db.select().from(discordMessage).where(eq(discordMessage.lanId, lanId)).all().map((m) => m.channelId),
  );
  let posted = 0;
  for (const c of listChannels(l.clanId)) {
    if (existing.has(c.channelId) || (onlyChannelId && c.channelId !== onlyChannelId)) continue;
    try {
      const m = await api<{ id: string }>("POST", `/channels/${c.channelId}/messages`, msg);
      db.insert(discordMessage).values({ lanId, channelId: c.channelId, messageId: m.id }).run();
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
      await api("PATCH", `/channels/${p.channelId}/messages/${p.messageId}`, msg);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Message was deleted by someone: forget it, so "Post to Discord" can post it again.
      if (status === 404) db.delete(discordMessage).where(eq(discordMessage.id, p.id)).run();
      else console.error("[discord] edit failed", e);
    }
  }
}

/** Posts a reminder to every channel now (orga "nudge" button). */
export async function postReminderNow(l: Lan, kind: ChatReminderKind) {
  if (!discordEnabled()) return 0;
  const msg = await reminderMessage(kind, l);
  if (!msg) return 0;
  let sent = 0;
  for (const c of listChannels(l.clanId)) {
    try {
      await api("POST", `/channels/${c.channelId}/messages`, msg);
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
        await api("POST", `/channels/${c.channelId}/messages`, msg);
        db.insert(channelReminderLog).values({ lanId: l.id, channelId: c.channelId, kind }).onConflictDoNothing().run();
        sent++;
      } catch (e) {
        if (!forgetIfGone(c.channelId, e)) console.error("[discord] reminder failed", e);
      }
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
  member?: { user: { id: string } };
  user?: { id: string };
  data?: { name?: string; custom_id?: string; options?: Option[] };
};

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
    .filter((m) => m.role === "admin")
    .map((m) => m.clan);
}

const upcomingLans = (clanIds: string[]) =>
  clanIds.length
    ? db
        .select()
        .from(lan)
        .where(and(gt(lan.endsAt, new Date()), inArray(lan.clanId, clanIds)))
        .orderBy(asc(lan.startsAt))
        .all()
    : [];

/**
 * Handles a verified interaction. Returns the immediate response, plus an
 * optional task to run after responding (Discord wants an answer within 3s).
 */
export function handleInteraction(i: Interaction): { response: Json; later?: () => Promise<void> } {
  if (i.type === 1) return { response: { type: 1 } }; // PING

  const discordUser = i.member?.user.id ?? i.user?.id ?? "";
  const editReply = (body: Json) => api("PATCH", `/webhooks/${appId()}/${i.token}/messages/@original`, body);
  const sub = i.data?.options?.[0];

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
          const extra = stored === "going" ? " Tick off your ticket in Seatbit once you have it." : "";
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

/** Unlinks a channel from Seatbit (clan settings). Checks the caller may manage the channel's clan. */
export function unlinkChannel(u: { id: string; role: string }, channelId: string) {
  const ch = db.select().from(discordChannel).where(eq(discordChannel.channelId, channelId)).get();
  if (!ch || !canManageClan(u, ch.clanId)) return false;
  db.delete(discordChannel).where(eq(discordChannel.channelId, channelId)).run();
  db.delete(discordMessage).where(eq(discordMessage.channelId, channelId)).run();
  return true;
}
