/**
 * After an upgrade: registers the Discord slash commands when they changed, and tells the
 * platform admins (DM and mail) once per new version what changed and whether anything is left to do.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { COMMANDS_STATE, commandsHash, discordEnabled, registerCommands } from "./discord-api";
import { getLegal } from "./legal";
import { appUrl } from "./mail";
import { notify } from "./notify";
import { readState, swapState } from "./settings";

const VERSION_STATE = "state.version";

export type CommandSync = { status: "registered" | "unchanged" | "off" } | { status: "failed"; error: string };

/** Registers the slash commands when the set differs from what was last registered. */
export async function syncDiscordCommands(): Promise<CommandSync> {
  if (!discordEnabled()) return { status: "off" };
  if (readState(COMMANDS_STATE) === commandsHash()) return { status: "unchanged" };
  try {
    await registerCommands();
    console.log("[upgrade] registered the changed Discord slash commands");
    return { status: "registered" };
  } catch (e) {
    const error = String((e as Error).message).slice(0, 300);
    console.error("[upgrade] registering Discord slash commands failed", e);
    return { status: "failed", error };
  }
}

const short = (sha: string) => sha.slice(0, 7);

export type UpgradeEvent = { before: string; now: string; changesUrl: string; commands: CommandSync };
type UpgradeListener = (e: UpgradeEvent) => Promise<unknown> | unknown;

// Shared across module instances, like the settings cache.
const g = globalThis as unknown as { __seatbitUpgradeListeners?: UpgradeListener[] };
const listeners = (g.__seatbitUpgradeListeners ??= []);

/** Hook for other channels (e.g. a platform ops Discord channel) that want to hear about a new version too. */
export function onUpgrade(listener: UpgradeListener) {
  listeners.push(listener);
}

/** Link to what changed between two commits on the source host (GitHub or GitLab style). */
export function changesUrl(sourceUrl: string, from: string, to: string) {
  const base = sourceUrl.replace(/\/+$/, "");
  return /^https:\/\/gitlab\./.test(base) ? `${base}/-/compare/${from}...${to}` : `${base}/compare/${from}...${to}`;
}

/**
 * Tells the platform admins once per new version. The first start (nothing stored yet) and
 * builds without git info stay quiet. The compare-and-set keeps two replicas from both sending.
 */
export async function announceUpgrade(commands: CommandSync) {
  const now = process.env.SEATBIT_COMMIT?.trim();
  if (!now) return 0;
  const before = readState(VERSION_STATE);
  if (before === now) return 0;
  if (!swapState(VERSION_STATE, before, now) || !before) return 0;

  const admins = db
    .select()
    .from(schema.user)
    .where(and(eq(schema.user.role, "admin"), eq(schema.user.isGuest, false)))
    .all();
  const link = changesUrl(getLegal().sourceUrl, before, now);
  let sent = 0;
  for (const u of admins) {
    const r = await notify(u, (t) => {
      const steps =
        commands.status === "registered"
          ? t("notice.upgradeCommandsRegistered")
          : commands.status === "failed"
            ? t("notice.upgradeCommandsFailed", { error: commands.error })
            : t("notice.upgradeNothingToDo");
      return {
        kind: "platform_upgrade",
        subject: t("notice.upgradeSubject", { version: short(now) }),
        text: t("notice.upgradeText", { name: u.firstName || u.name, url: appUrl, version: short(now), before: short(before), changes: link, steps }),
        url: `${appUrl}/admin/settings`,
      };
    }).catch((e) => {
      console.error("[upgrade] notice failed", e);
      return { email: false, dm: false };
    });
    if (r.email || r.dm) sent++;
  }
  console.log(`[upgrade] ${short(before)} -> ${short(now)}, told ${sent} platform admin(s)`);
  const event: UpgradeEvent = { before, now, changesUrl: link, commands };
  for (const l of listeners) await (async () => l(event))().catch((e) => console.error("[upgrade] listener failed", e));
  return sent;
}

/** Runs once after startup (instrumentation). */
export async function afterUpgrade() {
  const commands = await syncDiscordCommands();
  await announceUpgrade(commands);
}
