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

/** Slash commands, registered with `npm run discord:register`. */
export const commands = [
  {
    name: "lans",
    description: "Upcoming LANs and your status, with buttons to answer",
    type: 1,
  },
  {
    name: "claim",
    description: "Take over the guest profile your clan's orgas made for you",
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: "guest", description: "Only needed if I don't find you by name", required: false, autocomplete: true },
    ],
  },
  {
    // Seatbit checks the caller may manage the clan's members; no Discord permission needed.
    name: "guest",
    description: "Orgas: tell Seatbit which Discord member a guest is, so they take it over",
    type: 1,
    dm_permission: false,
    options: [
      { type: 6, name: "member", description: "The Discord member", required: true },
      { type: 3, name: "guest", description: "The guest in Seatbit", required: true, autocomplete: true },
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
  // Create Invite, View Channel, Send Messages, Embed Links, Pin Messages (pins the live LAN post)
  const perms = [0, 10, 11, 14, 51].reduce((p, bit) => p | (BigInt(1) << BigInt(bit)), BigInt(0));
  return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot+applications.commands&permissions=${perms}`;
}


/** Checks the bot token by fetching the bot's own user. */
export async function botIdentity() {
  return api<{ id: string; username: string }>("GET", "/users/@me");
}
