import { ActionButton, SettingsSection } from "@/components/settings-section";
import { DeleteBackupButton } from "@/components/backup-delete";
import { Card, Notice, Page, PageHeader, StatTile, btnSecondary } from "@/components/ui";
import {
  backupDir,
  backupDisk,
  backupIntervalHours,
  backupKeepDays,
  backupStatus,
  databaseSize,
  listBackups,
  nextBackupAt,
} from "@/lib/backup";
import { fmtBytes, fmtDate, relative } from "@/lib/format";
import { requirePlatform } from "@/lib/session";
import { settingsForAdmin } from "@/lib/settings";
import { localized } from "@/lib/settings-i18n";
import { getT } from "@/i18n/server";
import { saveSettings } from "../settings/actions";
import { backupNow } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: `${(await getT())("backups.title")} · Seatbit` };
}

/** Platform admins: database backups (schedule, list, download, back up now) and where they go. */
export default async function BackupsPage() {
  await requirePlatform("owner");
  const t = await getT();
  const now = new Date();
  const files = listBackups();
  const status = backupStatus();
  const next = nextBackupAt();
  const disk = backupDisk();
  const dbSize = databaseSize();
  const hours = backupIntervalHours();
  const keep = backupKeepDays();
  const total = files.reduce((n, f) => n + f.size, 0);
  const newest = files[0];
  // Overdue: scheduled backups are on, but the newest is more than twice the interval old.
  const overdue = hours > 0 && (!newest || now.getTime() - newest.at.getTime() > 2 * hours * 3600_000);
  const fields = settingsForAdmin()
    .filter((s) => s.group === "backup")
    .map((s) => localized(s, t));

  return (
    <Page>
      <PageHeader title={t("backups.title")} subtitle={t("backups.subtitle")} />

      {status.lastError && (
        <Notice tone="danger">
          {t("backups.lastError", { when: fmtDate(status.lastError.at, t.locale), error: status.lastError.message })}
        </Notice>
      )}
      {!status.lastError && overdue && files.length > 0 && <Notice tone="warn">{t("backups.overdue")}</Notice>}
      {hours <= 0 && <Notice tone="info">{t("backups.scheduleOff")}</Notice>}

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label={t("backups.newest")}
          value={newest ? relative(newest.at, now, t.locale) : "—"}
          sub={newest ? fmtDate(newest.at, t.locale) : t("backups.none")}
        />
        <StatTile
          label={t("backups.next")}
          value={next ? (next.getTime() <= now.getTime() ? t("backups.soon") : relative(next, now, t.locale)) : t("backups.off")}
          sub={hours > 0 ? t("backups.every", { count: hours }) : t("backups.offHint")}
        />
        <StatTile label={t("backups.count")} value={String(files.length)} sub={t("backups.totalSize", { size: fmtBytes(total) })} />
        <StatTile
          label={t("backups.database")}
          value={dbSize !== null ? fmtBytes(dbSize) : "—"}
          sub={disk ? t("backups.diskFree", { free: fmtBytes(disk.free) }) : undefined}
        />
      </div>

      <Card
        title={t("backups.files")}
        actions={<ActionButton action={backupNow}>{t("backups.now")}</ActionButton>}
      >
        <p className="-mt-2 mb-3 text-sm text-muted">
          {t("backups.folder")} <code className="break-all text-fg/90">{backupDir()}</code>
          {keep > 0 ? ` · ${t("backups.keep", { count: keep })}` : ` · ${t("backups.keepAll")}`}
        </p>
        {files.length === 0 ? (
          <p className="text-sm text-muted">{t("backups.empty")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {files.map((f, i) => (
              <li key={f.name} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-mono text-sm">{f.name}</span>
                  <span className="block text-xs text-muted tabular-nums">
                    {fmtDate(f.at, t.locale)} · {fmtBytes(f.size)}
                    {i === 0 && <span className="text-bit"> · {t("backups.latest")}</span>}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <a href={`/admin/backups/${encodeURIComponent(f.name)}`} className={btnSecondary} download>
                    {t("backups.download")}
                  </a>
                  <DeleteBackupButton name={f.name} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("settingGroups.backup.title")}>
        <p className="-mt-2 mb-4 text-sm text-muted">{t("settingGroups.backup.help")}</p>
        <SettingsSection fields={fields} action={saveSettings.bind(null, "backup")} />
      </Card>

      <Card title={t("backups.restoreTitle")}>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>{t("backups.restore1")}</li>
          <li>{t("backups.restore2")}</li>
          <li>{t("backups.restore3")}</li>
          <li>{t("backups.restore4")}</li>
        </ol>
        <p className="mt-3 text-xs text-faint">{t("backups.restoreDocs")}</p>
      </Card>
    </Page>
  );
}
