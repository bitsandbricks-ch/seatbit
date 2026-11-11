import Link from "next/link";
import { ActionButton, SettingsSection } from "@/components/settings-section";
import { Tabs } from "@/components/tabs";
import { Card } from "@/components/ui";
import { inviteUrl } from "@/lib/discord-api";
import { appUrl, mailTarget } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";
import { LOGIN_METHODS } from "@/lib/auth";
import { SETTING_GROUPS, type SettingGroup, canEncrypt, settingsForAdmin } from "@/lib/settings";
import { saveSettings, sendTestMail, setupDiscordBot } from "./actions";

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
  { id: "general", label: "Sign-up & admins" },
  { id: "automation", label: "Reminders" },
  { id: "server", label: "Server" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default async function SettingsPage({ searchParams }: PageProps<"/admin/settings">) {
  await requireAdmin();
  const { tab: rawTab } = await searchParams;
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
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-fg">
          ← Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Platform settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Saved values override the server&apos;s env vars; clear a field to fall back. Secrets are stored encrypted and
          never shown again.
        </p>
      </div>

      {!keySource && (
        <p className="rounded-md border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
          {canEncrypt()
            ? "No BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set, so secrets are encrypted with a development key. Set one before going live."
            : "Secrets can't be saved until BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set on the server."}
        </p>
      )}
      {all.some((s) => s.undecryptable) && (
        <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          Some saved secrets can&apos;t be decrypted, probably because the encryption key changed. They are ignored
          until you enter them again.
        </p>
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
    </div>
  );
}
