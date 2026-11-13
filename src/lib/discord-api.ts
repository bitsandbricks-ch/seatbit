/**
 * Minimal Discord REST client. Credentials come from the platform settings
 * (admin UI or env vars); no "server-only", so scripts can import it.
 */
import { getSetting } from "./settings";

// Overridable for local testing against a mock server.
const API = process.env.DISCORD_API_BASE ?? "https://discord.com/api/v10";
const botToken = () => getSetting("discord.botToken");
const appId = () => getSetting("discord.clientId");

/** The bot is on when it has a token (posting) and the app id (interaction follow-ups). */
export function discordEnabled() {
  return !!(botToken() && appId());
}


export type Json = Record<string, unknown>;

export async function api<T = Json>(method: string, path: string, body?: unknown, tokenOverride?: string): Promise<T> {
  const token = tokenOverride ?? botToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token && { Authorization: `Bot ${token}` }),
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (https://github.com/bitsandbricks-ch/seatbit, 1.0)",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 429) {
    const { retry_after } = (await res.json()) as { retry_after: number };
    await new Promise((r) => setTimeout(r, Math.ceil(retry_after * 1000)));
    return api(method, path, body, tokenOverride);
  }
  if (!res.ok) {
    const err = new Error(`Discord ${method} ${path} -> ${res.status}: ${await res.text()}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

// The event option of the member commands: suggests the clan's upcoming events; optional when only one fits.
const eventOption = (description = "Only needed if several events are open") => ({
  type: 3,
  name: "event",
  description,
  required: false,
  autocomplete: true,
});

const answerCommand = (name: string, description: string) => ({ name, description, type: 1, options: [eventOption()] });

/** Slash commands, registered with `npm run discord:register`. */
export const commands = [
  answerCommand("coming", "Say you're coming to a LAN"),
  answerCommand("unsure", "Say you're not sure yet if you come to a LAN"),
  answerCommand("not-coming", "Say you're not coming to a LAN"),
  {
    name: "status",
    description: "Where you stand: your answer, ticket, nick, seat and what's due next",
    type: 1,
    options: [eventOption("Only this event (default: your next ones)")],
  },
  {
    name: "ticket",
    description: "Tick off that you bought your ticket",
    type: 1,
    options: [
      eventOption(),
      { type: 5, name: "bought", description: "False takes it back (default: true)", required: false },
    ],
  },
  {
    name: "nick",
    description: "Set your nickname, for one LAN type or everywhere",
    type: 1,
    options: [
      { type: 3, name: "nick", description: "Your nick", required: true, min_length: 1, max_length: 32 },
      eventOption("Use it at this event's LAN type only (default: everywhere)"),
    ],
  },
  {
    name: "wish",
    description: "See or change your seat wishes",
    type: 1,
    options: [
      eventOption(),
      { type: 3, name: "near", description: "Add someone you want to sit near", required: false, autocomplete: true },
      { type: 3, name: "avoid", description: "Add someone you don't want to sit next to", required: false, autocomplete: true },
      {
        type: 3,
        name: "position",
        description: "Where in the row",
        required: false,
        choices: [
          { name: "Anywhere", value: "any" },
          { name: "At the edge", value: "edge" },
          { name: "In the middle", value: "middle" },
        ],
      },
      { type: 3, name: "seat", description: "A seat you'd like, e.g. F7", required: false, max_length: 12 },
      { type: 3, name: "note", description: "Anything else the leads should know", required: false, max_length: 300 },
      { type: 5, name: "clear", description: "Start over: remove all your wishes first", required: false },
    ],
  },
  {
    name: "lans",
    description: "Upcoming LANs and your status, with buttons to answer",
    type: 1,
  },
  {
    name: "claim",
    description: "Take over the guest profile your clan's leads made for you",
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: "guest", description: "Only needed if I don't find you by name", required: false, autocomplete: true },
    ],
  },
  {
    // Seatbit checks the caller may manage the clan's members; no Discord permission needed.
    name: "guest",
    description: "Leads: tell Seatbit which Discord member a guest is, so they take it over",
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: "guest", description: "The guest in Seatbit", required: true, autocomplete: true },
      // Not a native user picker: that lists the whole server. Seatbit suggests only people not in the clan yet.
      { type: 3, name: "member", description: "The Discord member (type to search)", required: true, autocomplete: true },
    ],
  },
  {
    name: "seatbit",
    description: "Seatbit bot settings for this server",
    type: 1,
    default_member_permissions: String(1 << 5), // Manage Server
    dm_permission: false,
    options: [
      {
        type: 1,
        name: "here",
        description: "Post your clan's LAN announcements and reminders in this channel",
        options: [
          { type: 3, name: "clan", description: "Only needed if you manage several clans", required: false, autocomplete: true },
        ],
      },
      { type: 1, name: "stop", description: "Stop posting in this channel" },
      { type: 1, name: "announce", description: "Post your clan's upcoming LANs in this channel now" },
    ],
  },
];

export async function registerCommands() {
  const id = appId();
  if (!id || !botToken()) throw new Error("The Discord application ID and bot token are required");
  return api("PUT", `/applications/${id}/commands`, commands);
}

/** Bot invite link with the permissions it needs. */
export function inviteUrl() {
  const id = appId();
  if (!id) return null;
  // Create Invite, Manage Channels (a channel per event), View Channel, Send Messages, Embed Links,
  // Create Public Threads and Send Messages in Threads (a thread per event), Pin Messages (pins the live LAN post)
  const perms = [0, 4, 10, 11, 14, 35, 38, 51].reduce((p, bit) => p | (BigInt(1) << BigInt(bit)), BigInt(0));
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot+applications.commands&permissions=${perms}`;
}


/** Checks the bot token by fetching the bot's own user. */
export async function botIdentity() {
  return api<{ id: string; username: string }>("GET", "/users/@me");
}
