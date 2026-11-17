/**
 * The member's Discord identity: username, and whether the bot found their linked
 * account on the clan's Discord server (`/seatbit validate`).
 */
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { api, type Json } from "./discord-api";
import { personLabel } from "./names";
import { clip } from "./format";
import type { T } from "../i18n/translate";

const { account, clanMember, user } = schema;

type DiscordUserJson = { id?: string; username?: string; discriminator?: string };

/** "name", or "name#1234" for accounts that never moved to the new usernames. */
export function discordTag(u: DiscordUserJson): string | null {
  if (!u.username) return null;
  return u.discriminator && u.discriminator !== "0" ? `${u.username}#${u.discriminator}` : u.username;
}

/** The Discord user id of a Seatbit account's linked Discord login. */
export function linkedDiscordId(userId: string) {
  return db
    .select({ id: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "discord")))
    .get()?.id;
}

/** What the profile shows: the linked account's id, username and whether the bot verified it. */
export function discordIdentity(userId: string) {
  const id = linkedDiscordId(userId);
  if (!id) return null;
  const u = db
    .select({ username: user.discordUsername, verifiedId: user.discordVerifiedId, verifiedAt: user.discordVerifiedAt })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  // A flag for another Discord account (relinked since) doesn't count.
  const verified = u?.verifiedId === id;
  return { id, username: u?.username ?? null, verifiedAt: verified ? (u?.verifiedAt ?? null) : null };
}

/**
 * Remembers the username after a Discord sign-in or link. The OAuth token only
 * reaches us there, so this is when the name gets refreshed. Never throws.
 */
export async function rememberDiscordUsername(userId: string, accessToken: string | null | undefined) {
  if (!accessToken) return;
  try {
    const base = process.env.DISCORD_API_BASE ?? "https://discord.com/api/v10";
    const res = await fetch(`${base}/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return;
    const name = discordTag((await res.json()) as DiscordUserJson);
    if (name) db.update(user).set({ discordUsername: name }).where(eq(user.id, userId)).run();
  } catch (e) {
    console.error("[discord] could not read the username", e);
  }
}

export type VerifyResult = { verified: string[]; missing: string[]; noDiscord: string[]; failed: number };

/**
 * Looks a Discord user up on the servers: their user object when they're on one,
 * false when on none, null when Discord couldn't tell us for some of them.
 */
async function findOnServers(discordId: string, guildIds: string[]): Promise<DiscordUserJson | false | null> {
  let unknown = false;
  for (const guildId of guildIds) {
    try {
      const m = await api<Json & { user?: DiscordUserJson }>("GET", `/guilds/${guildId}/members/${discordId}`);
      return m.user ?? {};
    } catch (e) {
      // 10007 = Unknown Member: not on this server. Anything else: we couldn't tell.
      if (!String((e as Error).message).includes("10007")) unknown = true;
    }
  }
  return unknown ? null : false;
}

/** Sets the verified flag for this Discord account, and refreshes the username while at it. */
export function markVerified(userId: string, discordId: string, du: DiscordUserJson = {}) {
  const name = discordTag(du);
  db.update(user)
    .set({ discordVerifiedId: discordId, discordVerifiedAt: new Date(), ...(name && { discordUsername: name }) })
    .where(eq(user.id, userId))
    .run();
}

/**
 * Profile › Verify: is the member's linked Discord account on one of their clans' servers?
 * "verified" sets the flag; the other answers say why not.
 */
export async function verifySelf(userId: string): Promise<"verified" | "no_discord" | "no_server" | "not_found" | "error"> {
  const discordId = linkedDiscordId(userId);
  if (!discordId) return "no_discord";
  const guildIds = [
    ...new Set(
      db
        .select({ id: schema.discordChannel.guildId })
        .from(schema.discordChannel)
        .innerJoin(clanMember, eq(clanMember.clanId, schema.discordChannel.clanId))
        .where(and(eq(clanMember.userId, userId), ne(clanMember.role, "pending")))
        .all()
        .map((r) => r.id),
    ),
  ];
  if (guildIds.length === 0) return "no_server";
  const found = await findOnServers(discordId, guildIds);
  if (found === null) return "error";
  if (!found) return "not_found";
  markVerified(userId, discordId, found);
  return "verified";
}

/** The Discord servers a clan linked with `/seatbit here`. */
export function clanGuildIds(clanId: string) {
  const rows = db.selectDistinct({ id: schema.discordChannel.guildId }).from(schema.discordChannel).where(eq(schema.discordChannel.clanId, clanId)).all();
  return rows.map((r) => r.id);
}

/**
 * Checks every clan member with a linked Discord account against the given servers:
 * those on one of them get the verified flag (and a fresh username), the rest are
 * listed. Guests and pending members are left out.
 */
export async function verifyClanMembers(clanId: string, guildIds: string[]): Promise<VerifyResult> {
  const rows = db
    .select({ id: user.id, firstName: user.firstName, lastName: user.lastName, name: user.name, discordId: account.accountId })
    .from(clanMember)
    .innerJoin(user, eq(user.id, clanMember.userId))
    .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "discord")))
    .where(and(eq(clanMember.clanId, clanId), ne(clanMember.role, "pending"), eq(user.isGuest, false), isNull(user.deletedAt)))
    .all();
  const out: VerifyResult = { verified: [], missing: [], noDiscord: [], failed: 0 };
  for (const r of rows) {
    const label = personLabel(r);
    if (!r.discordId) {
      out.noDiscord.push(label);
      continue;
    }
    const found = await findOnServers(r.discordId, guildIds);
    if (found) {
      markVerified(r.id, r.discordId, found);
      out.verified.push(label);
    } else if (found === null) out.failed++;
    else out.missing.push(label);
  }
  const byName = (a: string, b: string) => a.localeCompare(b);
  out.verified.sort(byName);
  out.missing.sort(byName);
  out.noDiscord.sort(byName);
  return out;
}

export const verifyCounts = (r: VerifyResult) => ({
  verified: r.verified.length,
  total: r.verified.length + r.missing.length + r.noDiscord.length + r.failed,
});

/** The bot's answer: counts, then who's missing. Discord caps messages at 2000 characters. */
export function verifyReport(t: T, clan: string, r: VerifyResult) {
  const c = verifyCounts(r);
  if (c.total === 0) return t("discordVerify.none", { clan });
  const names = (list: string[]) => {
    const shown = list.slice(0, 25).join(", ");
    return list.length > 25 ? `${shown}, …` : shown;
  };
  const lines = [t("discordVerify.result", { clan, verified: c.verified, total: c.total })];
  if (r.missing.length) lines.push(t("discordVerify.missing", { count: r.missing.length, names: names(r.missing) }));
  if (r.noDiscord.length) lines.push(t("discordVerify.noDiscord", { count: r.noDiscord.length, names: names(r.noDiscord) }));
  if (r.failed) lines.push(t("discordVerify.failed", { count: r.failed }));
  return clip(lines.join("\n"), 2000);
}

/** Linked / verified per member, for the badges in lead views. Members without Discord are left out. */
export function discordStates(userIds: string[]) {
  const out = new Map<string, "linked" | "verified">();
  if (userIds.length === 0) return out;
  const rows = db
    .select({ userId: account.userId, discordId: account.accountId, verifiedId: user.discordVerifiedId })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(account.providerId, "discord"), inArray(account.userId, userIds)))
    .all();
  for (const r of rows) out.set(r.userId, r.verifiedId === r.discordId ? "verified" : "linked");
  return out;
}
