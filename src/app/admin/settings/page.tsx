import { ActionButton, SettingsSection } from "@/components/settings-section";
import { Tabs } from "@/components/tabs";
import { Card, Notice, Page, PageHeader } from "@/components/ui";
import { inviteUrl } from "@/lib/discord-api";
import { appUrl, mailTarget } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";
import { billingEnabled, billingProblems, supporterClans } from "@/lib/billing";
import { fmtDay } from "@/lib/format";
import { LOGIN_METHODS } from "@/lib/auth";
import { type SettingGroup, type SettingView, canEncrypt, settingsForAdmin } from "@/lib/settings";
import { MAIL_TEMPLATES, defaultParts, getTemplate, savedTemplates } from "@/lib/mail-templates";
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from "@/i18n/config";
import type { FactRow } from "@/lib/mail-fill";
import { MailTemplateEditor } from "@/components/mail-template-editor";
import { getT } from "@/i18n/server";
import type { MessageKey, T } from "@/i18n/translate";
import { resetMailTemplate, saveMailTemplate, saveSettings, sendTemplateTest, sendTestMail, setupDiscordBot } from "./actions";

export async function generateMetadata() {
  return { title: `${(await getT())("clanSettings.platformSettings")} · Seatbit` };
}

function Url({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-faint">{label}: </span>
      <code className="break-all text-fg/90">{value}</code>
    </div>
  );
}

const TABS = ["mail", "discord", "google", "general", "automation", "legal", "billing", "templates", "server"] as const;
type TabId = (typeof TABS)[number];

/** A setting's label, help and choices in the admin's language (settings.ts keeps the English source). */
function localized(s: SettingView, t: T): SettingView {
  const slug = s.key.replace(".", "_");
  const tf = (k: string, fb: string | undefined) => {
    const v = t(k as MessageKey);
    return v === k ? fb : v;
  };
  return {
    ...s,
    label: tf(`settingDefs.${slug}.label`, s.label) ?? s.label,
    help: tf(`settingDefs.${slug}.help`, s.help),
    options: s.options?.map((o) => ({ ...o, label: tf(`settingDefs.${slug}.options.${o.value}`, o.label) ?? o.label })),
  };
}

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin();
  const t = await getT();
  const { tab: rawTab, lang: rawLang } = await searchParams;
  const mailLang: Locale = isLocale(rawLang) ? rawLang : t.locale;
  // Google login is switched off in code (LOGIN_METHODS), so its settings tab is hidden.
  const tabs = TABS.filter((x) => x !== "google" || LOGIN_METHODS.google);
  const tab: TabId = tabs.some((x) => x === rawTab) ? (rawTab as TabId) : "mail";
  const all = settingsForAdmin().map((s) => localized(s, t));
  const fields = (g: SettingGroup) => all.filter((s) => s.group === g);
  const keySource = process.env.SETTINGS_ENCRYPTION_KEY
    ? "SETTINGS_ENCRYPTION_KEY"
    : process.env.BETTER_AUTH_SECRET
      ? "BETTER_AUTH_SECRET"
      : null;
  const mail = mailTarget();
  const invite = inviteUrl();
  const loginFromDb = all.some(
    (x) => (x.key === "discord.clientId" || x.key === "discord.clientSecret") && x.source === "database",
  );

  const section = (g: SettingGroup, extra?: React.ReactNode) => (
    <div>
      <Card title={t(`settingGroups.${g}.title`)}>
        <p className="-mt-2 mb-4 text-sm text-muted">{t(`settingGroups.${g}.help`)}</p>
        {extra && <div className="mb-4 space-y-1 rounded-md border border-line bg-ink/50 p-3">{extra}</div>}
        <SettingsSection fields={fields(g)} action={saveSettings.bind(null, g)} />
      </Card>
    </div>
  );

  return (
    <Page>
      <PageHeader
        back={{ href: "/admin", label: "Admin" }}
        title={t("clanSettings.platformSettings")}
        subtitle={t("adminSettings.subtitle")}
      />

      {!keySource && (
        <Notice tone="warn">
          {t(canEncrypt() ? "adminSettings.devKey" : "adminSettings.noKey")}
        </Notice>
      )}
      {all.some((s) => s.undecryptable) && (
        <Notice tone="danger">
          {t("adminSettings.undecryptable")}
        </Notice>
      )}

      <Tabs
        tabs={tabs.map((id) => ({
          id,
          label: t(`adminSettings.tab.${id}`),
          badge: all.some((x) => x.group === id && x.undecryptable) ? "!" : undefined,
        }))}
        active={tab}
        hrefFor={(id) => `/admin/settings?tab=${id}`}
      />

      {tab === "general" && section("general")}

      {tab === "mail" &&
        section(
          "mail",
          <>
            <p className="text-xs text-muted">
              {mail.kind === "smtp"
                ? t("adminSettings.sendingVia", { host: mail.host })
                : t(mail.kind === "url" ? "adminSettings.sendingUrl" : "adminSettings.noSmtp")}
            </p>
            <ActionButton action={sendTestMail}>{t("adminSettings.testMail")}</ActionButton>
          </>,
        )}

      {tab === "discord" &&
        section(
          "discord",
          <>
            <div className="mb-2 space-y-1 text-xs text-muted">
              <p>
                {t.rich("adminSettings.firstSignIn", {
                  b: <span className="font-semibold text-fg">{t("adminSettings.firstSignInLabel")}</span>,
                  id: <code>DISCORD_CLIENT_ID</code>,
                  secret: <code>DISCORD_CLIENT_SECRET</code>,
                })}
              </p>
              {loginFromDb && (
                <p className="text-warn">
                  {t.rich("adminSettings.loginFromDb", {
                    cmd: <code>node scripts/admin.mjs reset-setting discord.clientSecret</code>,
                    id: <code>discord.clientId</code>,
                  })}
                </p>
              )}
            </div>
            <Url label={t("adminSettings.oauthRedirect")} value={`${appUrl}/api/auth/callback/discord`} />
            <Url label={t("adminSettings.interactions")} value={`${appUrl}/api/discord/interactions`} />
            {invite && (
              <div className="text-xs">
                <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                  {t("adminSettings.botInvite")}
                </a>
              </div>
            )}
            <div className="pt-2">
              <ActionButton action={setupDiscordBot}>{t("adminSettings.checkBot")}</ActionButton>
            </div>
          </>,
        )}

      {tab === "google" &&
        section("google", <Url label={t("adminSettings.googleRedirect")} value={`${appUrl}/api/auth/callback/google`} />)}

      {tab === "automation" && section("automation", <Url label={t("adminSettings.cronUrl")} value={`${appUrl}/api/cron/reminders`} />)}

      {tab === "legal" &&
        section(
          "legal",
          <p className="text-xs text-muted">
            {t.rich("adminSettings.legalHint", {
              terms: (
                <a href="/terms" className="text-bit hover:underline">
                  {t("footer.terms")}
                </a>
              ),
              privacy: (
                <a href="/privacy" className="text-bit hover:underline">
                  {t("footer.privacy")}
                </a>
              ),
            })}
          </p>,
        )}

      {tab === "billing" &&
        section(
          "billing",
          <BillingInfo t={t} />,
        )}

      {tab === "templates" && <TemplatesTab loc={mailLang} t={t} />}

      {tab === "server" && (
        <Card title={t("adminSettings.serverEnv")}>
          <p className="-mt-2 mb-3 text-sm text-muted">{t("adminSettings.serverEnvHint")}</p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-faint">{t("adminSettings.publicUrl")} (BETTER_AUTH_URL)</dt>
            <dd className="break-all">{appUrl}</dd>
            <dt className="text-faint">{t("adminSettings.sessionSecret")} (BETTER_AUTH_SECRET)</dt>
            <dd>{process.env.BETTER_AUTH_SECRET ? t("adminSettings.set") : <span className="text-warn">{t("adminSettings.notSet")}</span>}</dd>
            <dt className="text-faint">{t("adminSettings.encKey")}</dt>
            <dd>
              {keySource === "SETTINGS_ENCRYPTION_KEY" ? (
                "SETTINGS_ENCRYPTION_KEY"
              ) : keySource ? (
                t("adminSettings.derived")
              ) : (
                <span className="text-warn">{t("adminSettings.devKeyShort")}</span>
              )}
            </dd>
            <dt className="text-faint">{t("adminSettings.timezone")} (TZ)</dt>
            <dd>{process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
          </dl>
        </Card>
      )}
    </Page>
  );
}

/** Webhook URL, what's still missing, and which clans support the instance right now. */
function BillingInfo({ t }: { t: T }) {
  const problems = billingProblems();
  const supporters = supporterClans();
  return (
    <>
      <Url label={t("adminSettings.webhook")} value={`${appUrl}/api/billing/stripe/webhook`} />
      <p className="text-xs text-muted">
        {t.rich("adminSettings.stripeEvents", {
          events: (
            <>
              <code>checkout.session.completed</code>, <code>invoice.paid</code>, <code>customer.subscription.deleted</code>
            </>
          ),
        })}
      </p>
      {problems.length > 0 && <p className="text-xs text-warn">{t("adminSettings.missing", { list: problems.join(", ") })}</p>}
      {!billingEnabled() && problems.length === 0 && <p className="text-xs text-muted">{t("adminSettings.billingOff")}</p>}
      {supporters.length > 0 && (
        <p className="text-xs text-muted">
          {t("adminSettings.supporters")}{" "}
          {supporters.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              <a href={`/clans/${c.slug}`} className="text-bit hover:underline">
                {c.name}
              </a>{" "}
              ({t(c.plan === "month" ? "adminSettings.monthly" : "adminSettings.yearly")}, {t("adminSettings.until", { date: c.until ? fmtDay(c.until) : "–" })})
            </span>
          ))}
        </p>
      )}
    </>
  );
}

// Placeholders whose meaning differs in one template.
const VAR_VARIANT: Record<string, Record<string, string>> = {
  guestInvite: { firstName: "firstName_guest", link: "link_claim" },
  reminderPayment: { deadline: "deadline_ticket" },
  eventPublished: { deadline: "deadline_optional" },
  signupOpen: { deadline: "deadline_optional" },
  reminderEvent: { seat: "seat_final" },
};

function varHelp(t: T, id: string, name: string, fallback: string) {
  const key = `mailVar.${VAR_VARIANT[id]?.[name] ?? name}`;
  const v = t(key as MessageKey);
  return v === key ? fallback : v;
}

function TemplatesTab({ loc, t: tr }: { loc: Locale; t: T }) {
  const saved = savedTemplates();
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted">{tr("adminSettings.templatesHint", { placeholder: "{firstName}" })}</p>
      <p className="max-w-2xl text-sm text-muted">{tr("adminSettings.templatesLang")}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={tr("adminSettings.templateLang")}>
        {LOCALES.map((l) => (
          <a
            key={l}
            href={`?tab=templates&lang=${l}`}
            aria-current={l === loc ? "true" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${l === loc ? "border-bit bg-bit-soft text-fg" : "border-line text-muted hover:text-fg"}`}
          >
            {LOCALE_NAMES[l]}
          </a>
        ))}
      </div>
      {MAIL_TEMPLATES.map((t) => {
        const s = saved.get(t.id)?.[loc];
        const defaults = defaultParts(t.id, loc);
        return (
          <Card key={`${t.id}-${loc}`} title={tr(`mailtpl.${t.id}.title` as MessageKey)}>
            <MailTemplateEditor
              appUrl={appUrl}
              t={{
                id: t.id,
                when: tr(`mailtpl.${t.id}.when` as MessageKey),
                vars: Object.fromEntries(Object.entries(t.vars).map(([k, v]) => [k, varHelp(tr, t.id, k, v)])),
                facts: t.facts.map((f) => [...f] as FactRow),
                current: getTemplate(t.id, loc),
                defaults,
                edited: !!s,
                locale: loc,
              }}
              save={saveMailTemplate.bind(null, t.id, loc)}
              reset={resetMailTemplate.bind(null, t.id, loc)}
              test={sendTemplateTest.bind(null, t.id, loc)}
            />
          </Card>
        );
      })}
    </div>
  );
}
