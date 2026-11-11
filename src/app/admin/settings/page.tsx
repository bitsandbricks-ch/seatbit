import Link from "next/link";
import { ActionButton, SettingsSection } from "@/components/settings-section";
import { Card } from "@/components/ui";
import { inviteUrl } from "@/lib/discord-api";
import { appUrl, mailTarget } from "@/lib/mail";
import { requireAdmin } from "@/lib/session";
import { SETTING_GROUPS, type SettingGroup, canEncrypt, settingsForAdmin } from "@/lib/settings";
import { saveSettings, sendTestMail, setupDiscordBot } from "./actions";

export const metadata = { title: "Platform settings · Seatbit" };

function Url({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-zinc-500">{label}: </span>
      <code className="break-all text-zinc-300">{value}</code>
    </div>
  );
}

export default async function SettingsPage() {
  await requireAdmin();
  const all = settingsForAdmin();
  const fields = (g: SettingGroup) => all.filter((s) => s.group === g);
  const keySource = process.env.SETTINGS_ENCRYPTION_KEY
    ? "SETTINGS_ENCRYPTION_KEY"
    : process.env.BETTER_AUTH_SECRET
      ? "BETTER_AUTH_SECRET"
      : null;
  const mail = mailTarget();
  const invite = inviteUrl();

  const section = (g: SettingGroup, extra?: React.ReactNode) => (
    <div id={g} className="scroll-mt-20">
      <Card title={SETTING_GROUPS[g].title}>
        <p className="-mt-2 mb-4 text-sm text-zinc-400">{SETTING_GROUPS[g].help}</p>
        {extra && <div className="mb-4 space-y-1 rounded-md border border-line bg-zinc-950/50 p-3">{extra}</div>}
        <SettingsSection fields={fields(g)} action={saveSettings.bind(null, g)} />
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Admin
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Platform settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Values saved here override the server&apos;s environment variables. Clear a field to fall back to the env var
          again. Passwords, client secrets and tokens are stored encrypted and are never shown again after saving.
        </p>
      </div>

      {!keySource && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          {canEncrypt()
            ? "No BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set, so secrets are encrypted with a development key. Set one before going live."
            : "Secrets can't be saved until BETTER_AUTH_SECRET or SETTINGS_ENCRYPTION_KEY is set on the server."}
        </p>
      )}
      {all.some((s) => s.undecryptable) && (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          Some saved secrets can&apos;t be decrypted, probably because the encryption key changed. They are ignored until
          you enter them again.
        </p>
      )}

      {section("general")}

      {section(
        "mail",
        <>
          <p className="text-xs text-zinc-400">
            {mail.kind === "smtp"
              ? `Sending through ${mail.host}.`
              : mail.kind === "url"
                ? "Sending through the SMTP_URL environment variable. A host saved here takes over."
                : "No SMTP host set: mails are printed to the server log only."}
          </p>
          <ActionButton action={sendTestMail}>Send test mail to me</ActionButton>
        </>,
      )}

      {section(
        "discord",
        <>
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

      {section("google", <Url label="Authorized redirect URI" value={`${appUrl}/api/auth/callback/google`} />)}

      {section("automation", <Url label="Cron URL" value={`${appUrl}/api/cron/reminders`} />)}

      <Card title="Server environment">
        <p className="-mt-2 mb-3 text-sm text-zinc-400">
          These are needed before the app starts, so they can only be changed in the server&apos;s environment.
        </p>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-zinc-500">Public URL (BETTER_AUTH_URL)</dt>
          <dd className="break-all">{appUrl}</dd>
          <dt className="text-zinc-500">Session secret (BETTER_AUTH_SECRET)</dt>
          <dd>{process.env.BETTER_AUTH_SECRET ? "Set" : <span className="text-amber-300">Not set</span>}</dd>
          <dt className="text-zinc-500">Settings encryption key</dt>
          <dd>
            {keySource === "SETTINGS_ENCRYPTION_KEY"
              ? "SETTINGS_ENCRYPTION_KEY"
              : keySource
                ? "Derived from BETTER_AUTH_SECRET (rotating it means re-entering saved secrets)"
                : <span className="text-amber-300">Development key</span>}
          </dd>
          <dt className="text-zinc-500">Timezone (TZ)</dt>
          <dd>{process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
        </dl>
      </Card>
    </div>
  );
}
