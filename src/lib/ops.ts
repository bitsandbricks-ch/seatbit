/**
 * The platform team's own Discord channels (Platform settings → Discord):
 * an ops channel for what happens on this instance, each kind switchable,
 * and an optional public announcements channel.
 *
 * Posting never throws and never waits on Discord for the caller's sake:
 * a broken channel must not break a sign-up or a webhook.
 */
import { api, discordEnabled } from "./discord-api";
import { getBoolSetting, getSetting } from "./settings";
import { type ProblemKind, recordProblem } from "./jobs";
import { changeLines } from "./changelog";
import { appUrl } from "./mail";
import type { UpgradeEvent } from "./upgrade";
import { makeT } from "../i18n/translate";
import { instanceLocale } from "../i18n/user-locale";

/** Ops posts are for the platform team: the instance's language. */
export const opsT = () => makeT(instanceLocale());

export const OPS_KINDS = ["upgrade", "error", "clan", "payment", "report"] as const;
export type OpsKind = (typeof OPS_KINDS)[number];

// Setting that switches each kind on or off.
const TOGGLE: Record<OpsKind, string> = {
  upgrade: "ops.upgrades",
  error: "ops.errors",
  clan: "ops.clans",
  payment: "ops.payments",
  report: "ops.reports",
};

// Embed side colours: bit green, red, blue, gold, orange.
const COLOR: Record<OpsKind | "announce" | "test", number> = {
  upgrade: 0x2ee59d,
  error: 0xef4444,
  clan: 0x3b82f6,
  payment: 0xf5c518,
  report: 0xf97316,
  announce: 0x2ee59d,
  test: 0x8b8b8b,
};

export type OpsMessage = {
  title: string;
  text?: string;
  url?: string;
  fields?: { name: string; value: string }[];
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function embed(m: OpsMessage, color: number) {
  return {
    title: clip(m.title, 256),
    ...(m.text && { description: clip(m.text, 4000) }),
    ...(m.url && { url: m.url }),
    ...(m.fields?.length && {
      fields: m.fields.slice(0, 10).map((f) => ({ name: clip(f.name, 256), value: clip(f.value || "–", 1024), inline: true })),
    }),
    color,
    timestamp: new Date().toISOString(),
  };
}

/** Posts to a channel; throws on failure (for the test button). */
async function post(channelId: string, m: OpsMessage, color: number) {
  // No pings from text that came from users (clan names, report reasons).
  await api("POST", `/channels/${channelId}/messages`, { embeds: [embed(m, color)], allowed_mentions: { parse: [] } });
}

export const opsChannel = () => getSetting("ops.channelId") || undefined;
export const announceChannel = () => getSetting("ops.announceChannelId") || undefined;
export const opsKindOn = (kind: OpsKind) => getBoolSetting(TOGGLE[kind]);

/** Tells the platform team in the ops channel, if one is set and this kind is on. */
export async function postOps(kind: OpsKind, m: OpsMessage): Promise<void> {
  const channel = opsChannel();
  if (!channel || !opsKindOn(kind) || !discordEnabled()) return;
  try {
    await post(channel, m, COLOR[kind]);
  } catch (e) {
    // Logged only: posting an error about failing to post errors would loop.
    console.error("[ops] posting to the ops channel failed", e);
    recordProblem("discord", e);
  }
}

/** Posts to the public announcements channel, if one is set. */
export async function postAnnouncement(m: OpsMessage): Promise<boolean> {
  const channel = announceChannel();
  if (!channel || !discordEnabled()) return false;
  try {
    await post(channel, m, COLOR.announce);
    return true;
  } catch (e) {
    console.error("[ops] posting to the announcements channel failed", e);
    recordProblem("discord", e);
    return false;
  }
}

/** For the admin's "send a test" button: posts to both channels and says what failed. */
export async function testChannels(m: OpsMessage) {
  const out: { channel: "ops" | "announce"; ok: boolean; error?: string }[] = [];
  for (const [channel, id] of [
    ["ops", opsChannel()],
    ["announce", announceChannel()],
  ] as const) {
    if (!id) continue;
    try {
      await post(id, m, COLOR.test);
      out.push({ channel, ok: true });
    } catch (e) {
      out.push({ channel, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// ---------- Errors ----------

const g = globalThis as unknown as { __seatbitOpsErrors?: Map<string, number> };
const ERROR_QUIET_MS = 15 * 60 * 1000;

/**
 * Reports a server error to the ops channel. The same message is posted at
 * most once every 15 minutes, so a crash loop doesn't flood the channel.
 */
export function reportError(where: string, e: unknown, extra?: { name: string; value: string }[], kind: ProblemKind = "error") {
  const msg = e instanceof Error ? e.message : String(e);
  recordProblem(kind, e, where);
  const seen = (g.__seatbitOpsErrors ??= new Map());
  const key = `${where}|${msg}`;
  const last = seen.get(key);
  if (last && Date.now() - last < ERROR_QUIET_MS) return;
  seen.set(key, Date.now());
  // Keep the map small: forget entries older than the quiet time.
  if (seen.size > 200) for (const [k, at] of seen) if (Date.now() - at > ERROR_QUIET_MS) seen.delete(k);
  const stack = e instanceof Error && e.stack ? e.stack.split("\n").slice(1, 6).join("\n") : "";
  void postOps("error", {
    title: opsT()("ops.error", { where }),
    text: "```\n" + clip(`${msg}${stack ? `\n${stack}` : ""}`, 1800) + "\n```",
    fields: extra,
  });
}

/** A request path without its query and without anything that looks like a token (claim and reset links). */
export function safePath(path: string) {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) => (/^[\w-]{20,}$/.test(seg) ? "…" : seg))
    .join("/");
}

// ---------- Upgrades ----------

/** onUpgrade listener: the ops channel gets the technical notice, the announcements channel what changed. */
export async function announceUpgradeOnDiscord(e: UpgradeEvent) {
  const t = opsT();
  const version = e.now.slice(0, 7);
  const commands =
    e.commands.status === "registered"
      ? t("notice.upgradeCommandsRegistered")
      : e.commands.status === "failed"
        ? t("notice.upgradeCommandsFailed", { error: e.commands.error })
        : t("notice.upgradeNothingToDo");
  await postOps("upgrade", {
    title: t("notice.upgradeSubject", { version }),
    text: e.changes.length ? `${changeLines(e.changes, t.locale)}\n\n${commands}` : commands,
    url: e.changesUrl,
    fields: [{ name: t("ops.previous"), value: e.before.slice(0, 7) }],
  });
  // The public channel gets the changelog entries meant for everyone; internal changes stay quiet.
  const forEveryone = e.changes.filter((c) => c.audience === "everyone");
  if (!announceChannel() || !forEveryone.length) return;
  await postAnnouncement({
    title: t("changelog.announceTitle"),
    text: `${changeLines(forEveryone, t.locale)}\n\n${t("changelog.announceMore", { url: `${appUrl}/changelog` })}`,
    url: `${appUrl}/changelog`,
  });
}
