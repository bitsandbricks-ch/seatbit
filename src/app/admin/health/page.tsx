import type { ReactNode } from "react";
import Link from "next/link";
import { Card, Notice, Page, PageHeader, Pill, StatTile, btnSecondary, halves } from "@/components/ui";
import { requirePlatform } from "@/lib/session";
import { fmtBytes, healthReport, type Check } from "@/lib/health";
import { fmtDate, relative } from "@/lib/format";
import { getLegal } from "@/lib/legal";
import { getT } from "@/i18n/server";
import type { MessageKey, T } from "@/i18n/translate";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: `${(await getT())("health.title")} · Seatbit` };
}

function Status({ c, t }: { c: Check; t: T }) {
  if (c.ok === null) return <Pill>{t("health.notSetUp")}</Pill>;
  return c.ok ? <Pill tone="emerald">{t("health.ok")}</Pill> : <Pill tone="red">{t("health.failing")}</Pill>;
}

function Rows({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">{children}</dl>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-faint">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function uptime(ms: number, t: T) {
  const m = Math.floor(ms / 60000);
  const [d, h, min] = [Math.floor(m / 1440), Math.floor((m % 1440) / 60), m % 60];
  if (d) return t("health.upDays", { d, h });
  if (h) return t("health.upHours", { h, m: min });
  return t("health.upMinutes", { m: min });
}

// Known background jobs get a name and how often they run; others (added later) show their id.
const JOB_NAMES: Record<string, MessageKey> = { reminders: "health.job.reminders", publish: "health.job.publish", backup: "health.job.backup" };

export default async function HealthPage() {
  await requirePlatform("view");
  const t = await getT();
  const r = await healthReport();
  const now = new Date();
  const when = (ms: number | undefined) => (ms ? `${fmtDate(new Date(ms), t.locale)} (${relative(new Date(ms), now, t.locale)})` : "–");
  const sha = r.version.commit;
  const source = getLegal().sourceUrl.replace(/\/+$/, "");
  const failing = [r.mail.ok, r.discord.ok, r.discord.ops.ok, r.discord.announce.ok].filter((x) => x === false).length + (r.database.integrity === "ok" ? 0 : 1);

  return (
    <Page>
      <PageHeader
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        actions={
          <Link href="/admin/health" className={btnSecondary}>
            {t("health.refresh")}
          </Link>
        }
      />
      {failing > 0 ? <Notice tone="danger">{t("health.failingN", { count: failing })}</Notice> : <Notice>{t("health.allOk")}</Notice>}

      {/* data-volatile: values that change on every load; the screenshot script pins them. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3" data-volatile-tiles>
        <StatTile label={t("health.version")} value={sha ? sha.slice(0, 7) : "dev"} sub={r.version.node} />
        <StatTile label={t("health.uptime")} value={uptime(now.getTime() - r.version.started.getTime(), t)} sub={fmtDate(r.version.started, t.locale)} />
        <StatTile label={t("health.dbSize")} value={fmtBytes(r.database.size + r.database.wal)} sub={t("health.walN", { size: fmtBytes(r.database.wal) })} />
        <StatTile label={t("health.memory")} value={fmtBytes(r.version.memory)} sub={r.version.platform} />
      </div>

      <div className={halves}>
        <Card title={t("health.versionCard")}>
          <Rows>
            <Row label={t("health.commit")}>
              {sha ? (
                <a href={/^https:\/\/gitlab\./.test(source) ? `${source}/-/commit/${sha}` : `${source}/commit/${sha}`} target="_blank" rel="noreferrer" className="font-mono text-bit hover:underline" data-volatile="commit">
                  {sha.slice(0, 12)}
                </a>
              ) : (
                <span className="text-muted">{t("health.noCommit")}</span>
              )}
            </Row>
            {/* i18n-ignore: product name */}
            <Row label="Node.js">
              <span data-volatile="node">{r.version.node}</span>
            </Row>
            <Row label={t("health.started")}>
              <span data-volatile="started">{fmtDate(r.version.started, t.locale)}</span>
            </Row>
            <Row label={t("adminSettings.timezone")}>{r.version.tz}</Row>
          </Rows>
        </Card>

        <Card title={t("health.database")} actions={<Pill tone={r.database.integrity === "ok" ? "emerald" : "red"}>{r.database.integrity === "ok" ? t("health.ok") : t("health.failing")}</Pill>}>
          <Rows>
            <Row label={t("health.file")}>
              <code className="break-all text-xs" data-volatile="file">
                {r.database.path}
              </code>
            </Row>
            <Row label={t("health.size")}>
              <span data-volatile="size">
                {fmtBytes(r.database.size)} + {fmtBytes(r.database.wal)} WAL
              </span>
            </Row>
            {/* i18n-ignore: product name */}
            <Row label="SQLite">
              {r.database.sqlite} · {r.database.journal}
            </Row>
            <Row label={t("health.integrity")}>{r.database.integrity}</Row>
            <Row label={t("health.rows")}>
              {t("health.counts", {
                users: r.database.counts.users,
                clans: r.database.counts.clans,
                events: r.database.counts.events,
                audit: r.database.counts.audit,
              })}
            </Row>
          </Rows>
        </Card>

        <Card title={t("health.mail")} actions={<Status c={r.mail} t={t} />}>
          <Rows>
            <Row label={t("health.server")}>
              {r.mail.target.kind === "smtp" ? r.mail.target.host : r.mail.target.kind === "url" ? "SMTP_URL" : t("adminSettings.noSmtp")}
            </Row>
            {r.mail.detail && (
              <Row label={t("health.error")}>
                <span className="text-danger">{r.mail.detail}</span>
              </Row>
            )}
            <Row label={t("health.lastMail")}>
              {r.mail.last ? (
                <span className={r.mail.last.ok ? "" : "text-danger"}>
                  {when(r.mail.last.at)} {r.mail.last.ok ? "" : `· ${r.mail.last.error}`}
                </span>
              ) : (
                <span className="text-muted">{t("health.noneSinceStart")}</span>
              )}
            </Row>
          </Rows>
          <Link href="/admin/settings?tab=mail" className="mt-3 inline-block text-sm text-bit hover:underline">
            {t("health.mailSettings")}
          </Link>
        </Card>

        <Card title="Discord" actions={<Status c={r.discord} t={t} />}>
          <Rows>
            <Row label={t("health.bot")}>
              {r.discord.ok === null ? t("health.notSetUp") : r.discord.ok ? r.discord.bot : <span className="text-danger">{r.discord.detail}</span>}
            </Row>
            <Row label={t("health.clanChannels")}>{r.discord.channels}</Row>
            {(
              [
                ["ops", r.discord.ops],
                ["announce", r.discord.announce],
              ] as const
            ).map(([k, c]) => (
              <Row key={k} label={t(`adminSettings.opsChannel.${k}`)}>
                {c.ok === null ? (
                  <span className="text-muted">{t("health.notSetUp")}</span>
                ) : (
                  <span className={c.ok ? "" : "text-danger"}>{c.detail}</span>
                )}
              </Row>
            ))}
          </Rows>
          <Link href="/admin/settings?tab=discord" className="mt-3 inline-block text-sm text-bit hover:underline">
            {t("health.discordSettings")}
          </Link>
        </Card>
      </div>

      <Card title={t("health.jobs")}>
        <p className="-mt-2 mb-3 text-xs text-muted" data-volatile="since">
          {t("health.jobsHint", { since: fmtDate(r.trackedSince, t.locale) })}
        </p>
        <ul className="-my-1 divide-y divide-line">
          {(["reminders", "publish"] as const)
            .filter((id) => !r.jobs.some((j) => j.name === id))
            .map((id) => ({ name: id, runs: 0, running: false }) as (typeof r.jobs)[number])
            .concat(r.jobs)
            .map((j) => (
              <li key={j.name} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{JOB_NAMES[j.name] ? t(JOB_NAMES[j.name]) : j.name}</div>
                  <div className="text-xs text-muted">
                    {j.name === "reminders"
                      ? r.reminderMinutes
                        ? t("health.everyN", { count: r.reminderMinutes })
                        : t("health.cronOnly")
                      : j.name === "publish"
                        ? t("health.everyN", { count: 1 })
                        : null}
                    {j.runs > 0 && <span data-volatile="runs">{` · ${t("health.runs", { count: j.runs })}`}</span>}
                  </div>
                  {j.lastError && (
                    <div className="text-xs text-danger">
                      {when(j.lastError.at)}: {j.lastError.message}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-muted">
                  <span data-volatile="job">
                  {j.running ? (
                    <Pill tone="amber">{t("health.running")}</Pill>
                  ) : j.lastOk ? (
                    t("health.lastOk", { when: when(j.lastOk) })
                  ) : (
                    t("health.notRunYet")
                  )}
                  </span>
                </div>
              </li>
            ))}
        </ul>
      </Card>

      <Card title={t("health.problems")}>
        {r.problems.length === 0 ? (
          <p className="text-sm text-muted">{t("health.noProblems")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {r.problems.map((p, i) => (
              <li key={i} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Pill tone={p.kind === "error" ? "red" : "amber"}>{t(`health.kind.${p.kind}`)}</Pill>
                  <span>{when(p.at)}</span>
                  {p.where && <code className="break-all">{p.where}</code>}
                </div>
                <p className="mt-1 break-words font-mono text-xs">{p.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}
