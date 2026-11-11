/** Minimal Discord REST client (no database access, so scripts can import it). */

// Overridable for local testing against a mock server.
const API = process.env.DISCORD_API_BASE ?? "https://discord.com/api/v10";
const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_CLIENT_ID;

/** The bot is on when it has a token (posting) and the app id (interaction follow-ups). */
export const discordEnabled = !!(token && appId);


export type Json = Record<string, unknown>;

export async function api<T = Json>(method: string, path: string, body?: unknown): Promise<T> {
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
    return api(method, path, body);
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
    name: "seatbit",
    description: "Seatbit bot settings for this server",
    type: 1,
    default_member_permissions: String(1 << 5), // Manage Server
    dm_permission: false,
    options: [
      { type: 1, name: "here", description: "Post LAN announcements and reminders in this channel" },
      { type: 1, name: "stop", description: "Stop posting in this channel" },
      { type: 1, name: "announce", description: "Post all upcoming LANs in this channel now" },
    ],
  },
];

export async function registerCommands() {
  if (!appId || !token) throw new Error("DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN are required");
  return api("PUT", `/applications/${appId}/commands`, commands);
}

/** Bot invite link with the permissions it needs (view channel, send messages, embed links). */
export function inviteUrl() {
  if (!appId) return null;
  const perms = (1 << 10) | (1 << 11) | (1 << 14);
  return `https://discord.com/oauth2/authorize?client_id=${appId}&scope=bot+applications.commands&permissions=${perms}`;
}

