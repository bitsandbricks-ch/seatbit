"use server";

import { revalidatePath } from "next/cache";
import { botIdentity, commands, discordEnabled, registerCommands } from "@/lib/discord-api";
import { mailTarget, sendMail, verifySmtp } from "@/lib/mail";
import { type MailTemplateId, renderTemplate, resetTemplate, saveTemplate, templateDef } from "@/lib/mail-templates";
import { previewVars } from "@/lib/mail-fill";
import { isLocale } from "@/i18n/config";

const asLocale = (v: string) => (isLocale(v) ? v : "en");
import { requireAdmin } from "@/lib/session";
import { OWNER_SETTING_GROUPS, platformCan } from "@/lib/platform-roles";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { audit } from "@/lib/audit";
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
  const t = await getT();
  if (!(group in SETTING_GROUPS)) return done(false, "Unknown section");
  // Billing and legal details are the owner's business.
  if (OWNER_SETTING_GROUPS.includes(group) && !platformCan(me, "owner")) return done(false, t("errors.perm.platform"));

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

  // Validation messages in the admin's language, English from settings.ts as the fallback.
  const local = (key: string, msg: string | null) => {
    if (!msg) return msg;
    const k = `settingDefs.${key.replace(".", "_")}.invalid`;
    const v = t(k as MessageKey);
    return v === k ? msg : `${t(`settingDefs.${key.replace(".", "_")}.label` as MessageKey)}: ${v}`;
  };
  const errors = ops.flatMap((o) => ("set" in o ? [local(o.key, checkSetting(o.key, o.set))] : [])).filter(Boolean);
  if (errors.length) return done(false, errors.join(". "));
  if (ops.some((o) => "set" in o && SETTINGS.find((d) => d.key === o.key)?.kind === "secret") && !canEncrypt()) {
    return done(false, t("adminSettings.noKey"));
  }

  for (const o of ops) {
    if ("set" in o) setSetting(o.key, o.set, me.id);
    else clearSetting(o.key);
  }
  // Only the setting names: values can be secrets.
  if (ops.length) audit({ actorId: me.id, action: "settings.save", data: { group, keys: ops.map((o) => o.key) } });
  revalidatePath("/", "layout");
  return done(true, ops.length ? t("adminSettings.savedN", { count: ops.length }) : t("adminSettings.nothing"));
}

/** Checks the SMTP login and sends a test mail to the admin. */
export async function sendTestMail(): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  const target = mailTarget();
  if (target.kind === "console") return done(false, t("adminSettings.noSmtp"));
  try {
    await verifySmtp();
    await sendMail(
      me.email,
      t("adminSettings.testSubject"),
      t("adminSettings.testBody", { name: me.name }),
    );
    return done(true, t("adminSettings.testSent", { email: me.email }));
  } catch (e) {
    return done(false, t("adminSettings.smtpFailed", { error: errMsg(e) }));
  }
}

/** Checks the bot token and registers the slash commands. */
export async function setupDiscordBot(): Promise<ActionResult> {
  await requireAdmin();
  const t = await getT();
  if (!discordEnabled()) return done(false, t("adminSettings.botFirst"));
  try {
    const bot = await botIdentity();
    await registerCommands();
    return done(true, t("adminSettings.botOk", { name: bot.username, commands: commands.map((c) => "/" + c.name).join(", ") }));
  } catch (e) {
    const m = errMsg(e);
    return done(false, m.includes("-> 401") ? t("adminSettings.bot401") : m);
  }
}

/** Saves an edited mail template. Parts equal to the default remove the override. */
export async function saveMailTemplate(id: string, lang: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  const part = (k: string) => String(form.get(k) ?? "");
  const parts = { subject: part("subject"), body: part("body"), button: part("button"), note: part("note") };
  if (Object.values(parts).some((v) => v.length > 8000)) return done(false, t("adminSettings.tooLong"));
  if (!parts.subject.trim() || !parts.body.trim()) return done(false, t("adminSettings.emptyParts"));
  try {
    saveTemplate(id, parts, me.id, asLocale(lang));
  } catch (e) {
    return done(false, errMsg(e));
  }
  audit({ actorId: me.id, action: "mail_template.save", data: { template: templateDef(id).title, language: asLocale(lang) } });
  revalidatePath("/admin/settings");
  return done(true, t("common.saved"));
}

/** Brings back the built-in text of a mail template. */
export async function resetMailTemplate(id: string, lang: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  resetTemplate(id, asLocale(lang));
  audit({ actorId: me.id, action: "mail_template.reset", data: { template: templateLabel(id), language: asLocale(lang) } });
  revalidatePath("/admin/settings");
  return done(true, t("adminSettings.resetDone"));
}

/** Sends a template to the admin, filled with example values. */
export async function sendTemplateTest(id: string, lang: string): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  try {
    templateDef(id);
    const loc = asLocale(lang);
    const m = renderTemplate(id as MailTemplateId, { ...previewVars(loc), firstName: me.firstName || me.name }, loc);
    await sendMail(me.email, `[Test] ${m.subject}`, m.text, m.html);
    return done(true, mailTarget().kind === "console" ? t("adminSettings.toLog") : t("adminSettings.sentTo", { email: me.email }));
  } catch (e) {
    return done(false, errMsg(e));
  }
}

function templateLabel(id: string) {
  try {
    return templateDef(id).title;
  } catch {
    return id;
  }
}
