/** Shared bits of the Discord interaction handlers (discord.ts and discord-commands.ts). */
import { and, asc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Clan, Lan } from "@/db/schema";
import { fmtWhen } from "./announce";
import type { Json } from "./discord-api";
import { getClan } from "./clans";
import { appUrl } from "./mail";
import { makeT, type T } from "../i18n/translate";
import { isLocale, matchAcceptLanguage } from "../i18n/config";
import { clanLocale } from "../i18n/user-locale";

const { account, discordChannel, lan, user } = schema;

export type Option = { name: string; type?: number; value?: string | boolean; focused?: boolean; options?: Option[] };

export type DiscordUser = { id: string; username?: string; global_name?: string | null; bot?: boolean };

export type Interaction = {
  type: number;
  id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  channel?: { name?: string };
  member?: { user: DiscordUser; nick?: string | null };
  user?: DiscordUser;
  /** The caller's Discord client language, e.g. "de" or "en-US". */
  locale?: string;
  data?: {
    name?: string;
    custom_id?: string;
    options?: Option[];
    resolved?: { users?: Record<string, DiscordUser>; members?: Record<string, { nick?: string | null }> };
  };
};

export type Handled = { response: Json | Promise<Json>; later?: () => Promise<void> };

export const EPHEMERAL = 64;

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const reply = (content: string, extra: Json = {}) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, allowed_mentions: { parse: [] }, ...extra },
});

export const linkButton = (label: string, url: string) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });

/** The Seatbit user behind a Discord account, if they linked it. */
export function seatbitUserFor(discordUserId: string) {
  const userId = db
    .select()
    .from(account)
    .where(and(eq(account.providerId, "discord"), eq(account.accountId, discordUserId)))
    .get()?.userId;
  const u = userId ? db.select().from(user).where(eq(user.id, userId)).get() : undefined;
  // Suspended and deleted accounts get treated like unlinked Discord users.
  return u && !u.suspendedAt && !u.deletedAt ? u : undefined;
}

export const notLinked = (t: T) =>
  reply(t("bot.notLinked"), {
    components: [linkButton(t("bot.linkDiscord"), `${appUrl}/profile`)],
  });

/**
 * The language for replies to one person: their Seatbit language, else their Discord
 * client's, else the clan's of this server.
 */
export function interactionT(i: Interaction): T {
  const me = seatbitUserFor(i.member?.user.id ?? i.user?.id ?? "");
  if (isLocale(me?.locale)) return makeT(me.locale);
  return makeT(matchAcceptLanguage(i.locale) ?? clanLocale(clanForGuild(i.guild_id)));
}

/** The clan a Discord server is linked to (all its channels share one clan). */
export function clanForGuild(guildId: string | undefined): Clan | undefined {
  if (!guildId) return undefined;
  const ch = db.select().from(discordChannel).where(eq(discordChannel.guildId, guildId)).get();
  const c = ch ? getClan(ch.clanId) : undefined;
  // A suspended clan's server acts like an unlinked one.
  return c && !c.suspendedAt ? c : undefined;
}

/** A top-level option's value as text. */
export function opt(i: Interaction, name: string): string | undefined {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : String(v);
}

export function boolOpt(i: Interaction, name: string): boolean | undefined {
  const v = i.data?.options?.find((o) => o.name === name)?.value;
  return v === undefined ? undefined : v === true || v === "true";
}

/** Published events of these clans that haven't ended, soonest first. */
export const upcomingLans = (clanIds: string[]) =>
  clanIds.length
    ? db
        .select()
        .from(lan)
        .where(and(gt(lan.endsAt, new Date()), inArray(lan.clanId, clanIds), isNotNull(lan.publishedAt)))
        .orderBy(asc(lan.startsAt))
        .all()
    : [];

/** "⏰ Next: Buy ticket by Sat 14.11.2026, 18:00", or "" when nothing is due anymore. */
export function nextDeadline(l: Lan, now = new Date(), t: T = makeT("en")) {
  const next = (
    [
      ["bot.nextAnswer", l.signupDeadline],
      ["bot.nextTicket", l.paymentDueDate],
      ["bot.nextStart", l.startsAt],
    ] as const
  ).find(([, d]) => d && d > now);
  return next ? `⏰ ${t(next[0], { date: fmtWhen(next[1]!, t.locale) })}` : "";
}
