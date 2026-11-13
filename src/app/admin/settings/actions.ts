"use server";

import { revalidatePath } from "next/cache";
import { botIdentity, commands, discordEnabled, registerCommands } from "@/lib/discord-api";
import { appUrl, mailTarget, sendMail, verifySmtp } from "@/lib/mail";
import { type MailTemplateId, renderTemplate, resetTemplate, saveTemplate, templateDef } from "@/lib/mail-templates";
import { previewVars } from "@/lib/mail-fill";
import { isLocale } from "@/i18n/config";

const asLocale = (v: string) => (isLocale(v) ? v : "en");
import { requireAdmin } from "@/lib/session";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { audit } from "@/lib/audit";
import { announceChannel, opsChannel, opsT, postAnnouncement, testChannels } from "@/lib/ops";
import { currentMaintenance, maintenanceTitle } from "@/lib/maintenance";
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

/** Posts a test message to the ops and announcements channels. */
export async function testOpsChannels(): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  if (!discordEnabled()) return done(false, t("adminSettings.botFirst"));
  if (!opsChannel() && !announceChannel()) return done(false, t("adminSettings.opsNoChannel"));
  const res = await testChannels({ title: t("adminSettings.opsTestTitle"), text: t("adminSettings.opsTestText", { name: me.name }) });
  const bad = res.filter((r) => !r.ok);
  if (bad.length)
    return done(
      false,
      bad.map((r) => t("adminSettings.opsTestFailed", { channel: t(`adminSettings.opsChannel.${r.channel}`), error: hintFor(r.error ?? "", t) })).join(" "),
    );
  return done(true, t("adminSettings.opsTestOk", { count: res.length }));
}

/** Discord's usual answers when the bot can't post, in words an admin can act on. */
function hintFor(error: string, t: Awaited<ReturnType<typeof getT>>) {
  if (error.includes("-> 403")) return t("adminSettings.opsNoAccess");
  if (error.includes("-> 404")) return t("adminSettings.opsNotFound");
  return error;
}

/** Posts an announcement the admin wrote to the public announcements channel. */
export async function postPlatformAnnouncement(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  const title = String(form.get("title") ?? "").trim();
  const text = String(form.get("text") ?? "").trim();
  if (!title || title.length > 200 || text.length > 3500) return done(false, t("adminSettings.announceInvalid"));
  if (!announceChannel()) return done(false, t("adminSettings.announceNoChannel"));
  const ok = await postAnnouncement({ title, text: text || undefined, url: appUrl });
  if (!ok) return done(false, t("adminSettings.announceFailed"));
  audit({ actorId: me.id, action: "settings.announce", data: { title } });
  return done(true, t("adminSettings.announceOk"));
}

/** Saves the maintenance banner; "clear" removes it. Optionally posts it to the announcements channel. */
export async function saveMaintenance(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const t = await getT();
  const clear = form.get("clear") === "1";
  const values = {
    "maintenance.message": clear ? "" : String(form.get("message") ?? "").trim(),
    "maintenance.startsAt": clear ? "" : String(form.get("startsAt") ?? "").trim(),
    "maintenance.endsAt": clear ? "" : String(form.get("endsAt") ?? "").trim(),
  };
  if (values["maintenance.message"].length > 500) return done(false, t("adminSettings.maintenanceTooLong"));
  for (const [k, v] of Object.entries(values)) if (v && checkSetting(k, v)) return done(false, t("adminSettings.maintenanceBadDate"));
  const s = values["maintenance.startsAt"];
  const e = values["maintenance.endsAt"];
  if (s && e && new Date(e) <= new Date(s)) return done(false, t("adminSettings.maintenanceOrder"));
  for (const [k, v] of Object.entries(values)) {
    if (v) setSetting(k, v, me.id);
    else if (resolveSetting(k).source === "database") clearSetting(k);
  }
  audit({ actorId: me.id, action: clear ? "settings.maintenance_clear" : "settings.maintenance", data: { message: values["maintenance.message"] } });
  let posted = false;
  const m = currentMaintenance();
  if (!clear && m && form.get("announce") === "on") {
    const it = opsT();
    posted = await postAnnouncement({ title: maintenanceTitle(m, it), text: m.message, url: appUrl });
  }
  revalidatePath("/", "layout");
  if (clear) return done(true, t("adminSettings.maintenanceCleared"));
  if (!m) return done(true, values["maintenance.message"] ? t("adminSettings.maintenancePast") : t("adminSettings.maintenanceCleared"));
  return done(true, posted ? t("adminSettings.maintenanceSavedPosted") : t("common.saved"));
}
