import { ActionButton, SettingsSection } from "@/components/settings-section";
import { Tabs } from "@/components/tabs";
import { Card, Notice, Page, PageHeader } from "@/components/ui";
import { inviteUrl } from "@/lib/discord-api";
import { appUrl, mailTarget } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";
import { billingEnabled, billingProblems, supporterClans } from "@/lib/billing";
import { fmtDay } from "@/lib/format";
import { LOGIN_METHODS } from "@/lib/auth";
import { SETTING_GROUPS, type SettingGroup, canEncrypt, settingsForAdmin } from "@/lib/settings";
import { MAIL_TEMPLATES, defaultParts, getTemplate, savedTemplates } from "@/lib/mail-templates";
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from "@/i18n/config";
import type { FactRow } from "@/lib/mail-fill";
import { MailTemplateEditor } from "@/components/mail-template-editor";
import { resetMailTemplate, saveMailTemplate, saveSettings, sendTemplateTest, sendTestMail, setupDiscordBot } from "./actions";

export const metadata = { title: "Platform settings · Seatbit" };

function Url({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-faint">{label}: </span>
      <code className="break-all text-fg/90">{value}</code>
    </div>
  );
}

const TABS = [
  { id: "mail", label: "Email" },
  { id: "discord", label: "Discord" },
  { id: "google", label: "Google" },
  { id: "general", label: "General" },
  { id: "automation", label: "Reminders" },
  { id: "legal", label: "Operator & legal" },
  { id: "billing", label: "Supporters" },
  { id: "templates", label: "Mail templates" },
  { id: "server", label: "Server" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin();
  const { tab: rawTab, lang: rawLang } = await searchParams;
  const mailLang: Locale = isLocale(rawLang) ? rawLang : "en";
  // Google login is switched off in code (LOGIN_METHODS), so its settings tab is hidden.
  const tabs = TABS.filter((t) => t.id !== "google" || LOGIN_METHODS.google);
  const tab: TabId = tabs.some((t) => t.id === rawTab) ? (rawTab as TabId) : "mail";
  const all = settingsForAdmin();
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
      <Card title={SETTING_GROUPS[g].title}>
        <p className="-mt-2 mb-4 text-sm text-muted">{SETTING_GROUPS[g].help}</p>
        {extra && <div className="mb-4 space-y-1 rounded-md border border-line bg-ink/50 p-3">{extra}</div>}
        <SettingsSection fields={fields(g)} action={saveSettings.bind(null, g)} />
      </Card>
    </div>
  );

  return (
    <Page>
      <PageHeader
        back={{ href: "/admin", label: "Admin" }}
        title="Platform settings"
        subtitle="Saved values override the server's env vars; clear a field to fall back. Secrets are stored encrypted and never shown again."
      />

      {!keySource && (
        <Notice tone="warn">
          {canEncrypt()
            ? "No BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set, so secrets are encrypted with a development key. Set one before going live."
            : "Secrets can't be saved until BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set on the server."}
        </Notice>
      )}
      {all.some((s) => s.undecryptable) && (
        <Notice tone="danger">
          Some saved secrets can&apos;t be decrypted, probably because the encryption key changed. They are ignored
          until you enter them again.
        </Notice>
      )}

      <Tabs
        tabs={tabs.map((t) => ({
          ...t,
          badge: all.some((x) => x.group === t.id && x.undecryptable) ? "!" : undefined,
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
                ? `Sending through ${mail.host}.`
                : mail.kind === "url"
                  ? "Sending through the SMTP_URL environment variable. A host saved here takes over."
                  : "No SMTP host set: mails are printed to the server log only."}
            </p>
            <ActionButton action={sendTestMail}>Send test mail to me</ActionButton>
          </>,
        )}

      {tab === "discord" &&
        section(
          "discord",
          <>
            <div className="mb-2 space-y-1 text-xs text-muted">
              <p>
                <span className="font-semibold text-fg">First sign-in:</span> login is Discord-only, so the
                application ID and client secret must be set as <code>DISCORD_CLIENT_ID</code> and{" "}
                <code>DISCORD_CLIENT_SECRET</code> env vars before anyone can sign in and open this page. After that
                you can change them here.
              </p>
              {loginFromDb && (
                <p className="text-warn">
                  The login credentials below are saved here and override the env vars. If you save wrong ones, nobody
                  can sign in; undo with{" "}
                  <code>node scripts/admin.mjs reset-setting discord.clientSecret</code> (and{" "}
                  <code>discord.clientId</code>) in the container.
                </p>
              )}
            </div>
            <Url label="OAuth2 redirect" value={`${appUrl}/api/auth/callback/discord`} />
            <Url label="Interactions endpoint URL" value={`${appUrl}/api/discord/interactions`} />
            {invite && (
              <div className="text-xs">
                <a href={invite} target="_blank" rel="noreferrer" className="text-bit hover:underline">
                  Bot invite link
                </a>
              </div>
            )}
            <div className="pt-2">
              <ActionButton action={setupDiscordBot}>Check bot & register slash commands</ActionButton>
            </div>
          </>,
        )}

      {tab === "google" &&
        section("google", <Url label="Authorized redirect URI" value={`${appUrl}/api/auth/callback/google`} />)}

      {tab === "automation" && section("automation", <Url label="Cron URL" value={`${appUrl}/api/cron/reminders`} />)}

      {tab === "legal" &&
        section(
          "legal",
          <p className="text-xs text-muted">
            The built-in <a href="/terms" className="text-bit hover:underline">Terms of Service</a> and{" "}
            <a href="/privacy" className="text-bit hover:underline">Privacy Policy</a> are a starting point written for
            Swiss and EU law, filled in with the details below. Check that they fit how you run your instance, or link
            your own documents.
          </p>,
        )}

      {tab === "billing" &&
        section(
          "billing",
          <BillingInfo />,
        )}

      {tab === "templates" && <TemplatesTab loc={mailLang} />}

      {tab === "server" && (
        <Card title="Server environment">
          <p className="-mt-2 mb-3 text-sm text-muted">
            These are needed before the app starts, so they can only be changed in the server&apos;s environment.
          </p>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="text-faint">Public URL (BETTER_AUTH_URL)</dt>
            <dd className="break-all">{appUrl}</dd>
            <dt className="text-faint">Session secret (BETTER_AUTH_SECRET)</dt>
            <dd>{process.env.BETTER_AUTH_SECRET ? "Set" : <span className="text-warn">Not set</span>}</dd>
            <dt className="text-faint">Settings encryption key</dt>
            <dd>
              {keySource === "SETTINGS_ENCRYPTION_KEY" ? (
                "SETTINGS_ENCRYPTION_KEY"
              ) : keySource ? (
                "Derived from BETTER_AUTH_SECRET (rotating it means re-entering saved secrets)"
              ) : (
                <span className="text-warn">Development key</span>
              )}
            </dd>
            <dt className="text-faint">Timezone (TZ)</dt>
            <dd>{process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
          </dl>
        </Card>
      )}
    </Page>
  );
}

/** Webhook URL, what's still missing, and which clans support the instance right now. */
function BillingInfo() {
  const problems = billingProblems();
  const supporters = supporterClans();
  return (
    <>
      <Url label="Webhook endpoint" value={`${appUrl}/api/billing/stripe/webhook`} />
      <p className="text-xs text-muted">
        Events: <code>checkout.session.completed</code>, <code>invoice.paid</code>,{" "}
        <code>customer.subscription.deleted</code>. Turn on the payment methods (card, TWINT, Apple Pay, Google Pay) and
        the customer portal in the Stripe Dashboard.
      </p>
      {problems.length > 0 && <p className="text-xs text-warn">Still missing: {problems.join(", ")}.</p>}
      {!billingEnabled() && problems.length === 0 && <p className="text-xs text-muted">Off: clan admins don&apos;t see anything about payments.</p>}
      {supporters.length > 0 && (
        <p className="text-xs text-muted">
          Supporters:{" "}
          {supporters.map((c, i) => (
            <span key={c.slug}>
              {i > 0 && ", "}
              <a href={`/clans/${c.slug}`} className="text-bit hover:underline">
                {c.name}
              </a>{" "}
              ({c.plan === "month" ? "monthly" : "yearly"}, until {c.until ? fmtDay(c.until) : "–"})
            </span>
          ))}
        </p>
      )}
    </>
  );
}

function TemplatesTab({ loc }: { loc: Locale }) {
  const saved = savedTemplates();
  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-muted">
        The emails Seatbit sends. They all share one layout: the clan in the header, &quot;Hi name,&quot;, your text, a
        box with the event facts, a button and a small print line. Change the wording to fit your clan; placeholders like{" "}
        {"{firstName}"} are filled in for each person. Reset brings back the built-in text.
      </p>
      <p className="max-w-2xl text-sm text-muted">
        Each mail goes out in the person&apos;s language (guest invites in the clan&apos;s). Every language has its own
        text.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Template language">
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
          <Card key={`${t.id}-${loc}`} title={t.title}>
            <MailTemplateEditor
              appUrl={appUrl}
              t={{
                id: t.id,
                when: t.when,
                vars: t.vars,
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
