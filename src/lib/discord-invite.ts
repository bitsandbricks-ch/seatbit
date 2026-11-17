import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { api, discordEnabled } from "./discord-api";
import { makeT, type T } from "../i18n/translate";

const { discordChannel, account } = schema;

export type ClanServer = { guildId: string; guildName: string; inviteUrl: string | null };

/** Accepts discord.gg/abc or discord.com/invite/abc links (admins can paste their own). */
export function normalizeInvite(raw: string) {
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/);
  return m ? `https://discord.gg/${m[1]}` : null;
}

// Channels where the bot couldn't create an invite, and when. Pages call this on every load,
// so without it a missing "Create Invite" permission costs a Discord round trip each time.
const g = globalThis as unknown as {
  __seatbitInviteFailed?: Map<string, number>;
  __seatbitGuildMembers?: Map<string, { inGuild: boolean | null; at: number }>;
};
const inviteFailed = (g.__seatbitInviteFailed ??= new Map());
const INVITE_RETRY = 10 * 60_000;

/**
 * An invite link for a linked server: the one an admin set, else one the bot
 * creates in the linked channel (needs "Create Invite"), stored for next time.
 */
async function ensureInvite(row: typeof discordChannel.$inferSelect) {
  if (row.inviteUrl) return row.inviteUrl;
  if (!discordEnabled()) return null;
  const failedAt = inviteFailed.get(row.channelId);
  if (failedAt && Date.now() - failedAt < INVITE_RETRY) return null;
  try {
    const inv = await api<{ code: string; guild?: { name?: string } }>(
      "POST",
      `/channels/${row.channelId}/invites`,
      { max_age: 0, max_uses: 0, unique: false },
      undefined,
      { quick: true },
    );
    const url = `https://discord.gg/${inv.code}`;
    db.update(discordChannel)
      .set({ inviteUrl: url, guildName: inv.guild?.name ?? row.guildName })
      .where(eq(discordChannel.guildId, row.guildId))
      .run();
    inviteFailed.delete(row.channelId);
    return url;
  } catch (e) {
    inviteFailed.set(row.channelId, Date.now());
    console.warn(`[discord] can't create an invite for ${row.guildId} (missing "Create Invite"?)`, String(e).slice(0, 200));
    return null;
  }
}

/** The Discord servers a clan linked, one row per server, with an invite link if there is one. */
export async function clanServers(clanId: string): Promise<ClanServer[]> {
  const rows = db.select().from(discordChannel).where(eq(discordChannel.clanId, clanId)).all();
  const byGuild = new Map<string, typeof rows>();
  for (const r of rows) byGuild.set(r.guildId, [...(byGuild.get(r.guildId) ?? []), r]);
  return Promise.all(
    [...byGuild].map(async ([guildId, list]) => ({
      guildId,
      guildName: list.find((r) => r.guildName)?.guildName ?? "",
      inviteUrl: await ensureInvite(list.find((r) => r.inviteUrl) ?? list[0]),
    })),
  );
}

// Membership answers change rarely; cache them so pages stay fast. "Can't tell" (bot not on
// that server, Discord down) is cached briefly too, or every page load would ask again.
const cache = (g.__seatbitGuildMembers ??= new Map());
const TTL_IN = 30 * 60_000;
const TTL_OUT = 2 * 60_000;

/** true/false when Discord tells us, null when we can't check (bot not in that server, API down). */
export async function isInGuild(guildId: string, discordUserId: string): Promise<boolean | null> {
  const key = `${guildId}:${discordUserId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.inGuild ? TTL_IN : TTL_OUT)) return hit.inGuild;
  try {
    await api("GET", `/guilds/${guildId}/members/${discordUserId}`, undefined, undefined, { quick: true });
    cache.set(key, { inGuild: true, at: Date.now() });
    return true;
  } catch (e) {
    const msg = String((e as Error).message);
    if (msg.includes("-> 404") && msg.includes("10007")) {
      cache.set(key, { inGuild: false, at: Date.now() });
      return false;
    }
    cache.set(key, { inGuild: null, at: Date.now() });
    return null;
  }
}

/**
 * The clan servers this member should be invited to: servers they aren't on.
 * Without a linked Discord account we can't check, so every server is offered.
 */
export async function missingServers(userId: string, clanId: string): Promise<ClanServer[]> {
  if (!discordEnabled()) return [];
  const servers = (await clanServers(clanId)).filter((s) => s.inviteUrl);
  if (servers.length === 0) return [];
  const discordId = db
    .select({ id: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
    .get()?.id;
  if (!discordId) return servers;
  const inGuild = await Promise.all(servers.map((s) => isInGuild(s.guildId, discordId)));
  return servers.filter((_, i) => inGuild[i] === false);
}

/** Admin sets (or clears, with "") the invite link for one of the clan's servers. */
export function setServerInvite(clanId: string, guildId: string, raw: string, t: T = makeT("en")) {
  const url = raw.trim() ? normalizeInvite(raw) : "";
  if (url === null) return { error: t("errors.discordInvite") };
  db.update(discordChannel)
    .set({ inviteUrl: url })
    .where(and(eq(discordChannel.clanId, clanId), eq(discordChannel.guildId, guildId)))
    .run();
  return {};
}
