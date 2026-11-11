"use server";

import { revalidatePath } from "next/cache";
import { botIdentity, commands, discordEnabled, registerCommands } from "@/lib/discord-api";
import { mailTarget, sendMail, verifySmtp } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";
import {
  SETTINGS,
  SETTING_GROUPS,
  type SettingGroup,
  canEncrypt,
  checkSetting,
  clearSetting,
  resolveSetting,
  setSetting,
} from "@/lib/settings";

export type ActionResult = { ok: boolean; message: string; at: number } | undefined;

const done = (ok: boolean, message: string): ActionResult => ({ ok, message, at: Date.now() });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Saves one section of the settings page. Empty text fields and "Use default"
 * choices remove the saved value so the env var / default applies again.
 * Secret fields are only changed when something is typed in, or removed with
 * their "remove" checkbox.
 */
export async function saveSettings(group: SettingGroup, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!(group in SETTING_GROUPS)) return done(false, "Unknown section");

  const ops: ({ key: string; set: string } | { key: string; clear: true })[] = [];
  for (const d of SETTINGS.filter((s) => s.group === group)) {
    const raw = form.get(d.key);
    const value = typeof raw === "string" ? raw.trim() : "";
    const current = resolveSetting(d.key);
    if (d.kind === "secret") {
      if (form.get(`clear:${d.key}`) === "on") ops.push({ key: d.key, clear: true });
      else if (value) ops.push({ key: d.key, set: value });
      continue;
    }
    if (!value) {
      if (current.source === "database") ops.push({ key: d.key, clear: true });
    } else if (current.source !== "database" || current.value !== value) {
      ops.push({ key: d.key, set: value });
    }
  }

  const errors = ops.flatMap((o) => ("set" in o ? [checkSetting(o.key, o.set)] : [])).filter(Boolean);
  if (errors.length) return done(false, errors.join(". "));
  if (ops.some((o) => "set" in o && SETTINGS.find((d) => d.key === o.key)?.kind === "secret") && !canEncrypt()) {
    return done(false, "Secrets can't be saved: set SETTINGS_ENCRYPTION_KEY or BETTER_AUTH_SECRET on the server first.");
  }

  for (const o of ops) {
    if ("set" in o) setSetting(o.key, o.set, me.id);
    else clearSetting(o.key);
  }
  revalidatePath("/", "layout");
  return done(true, ops.length ? `Saved ${ops.length} change${ops.length === 1 ? "" : "s"}.` : "Nothing changed.");
}

/** Checks the SMTP login and sends a test mail to the admin. */
export async function sendTestMail(): Promise<ActionResult> {
  const me = await requireAdmin();
  const target = mailTarget();
  if (target.kind === "console") return done(false, "No SMTP host is configured, so mail only goes to the server log.");
  try {
    await verifySmtp();
    await sendMail(
      me.email,
      "Seatbit test mail",
      `Hi ${me.name},\n\nthis is a test mail from the Seatbit platform settings. If you can read it, email works.`,
    );
    return done(true, `Test mail sent to ${me.email}.`);
  } catch (e) {
    return done(false, `SMTP failed: ${errMsg(e)}`);
  }
}

/** Checks the bot token and registers the slash commands. */
export async function setupDiscordBot(): Promise<ActionResult> {
  await requireAdmin();
  if (!discordEnabled()) return done(false, "Set the application ID and bot token first.");
  try {
    const bot = await botIdentity();
    await registerCommands();
    return done(true, `Connected as ${bot.username}. Registered ${commands.map((c) => "/" + c.name).join(", ")}.`);
  } catch (e) {
    const m = errMsg(e);
    return done(false, m.includes("-> 401") ? "Discord rejected the bot token (401). Check it and save again." : m);
  }
}
