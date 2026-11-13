import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { suspendClanAction, unsuspendClanAction, updateReport } from "@/app/moderation-actions";
import { Tabs } from "@/components/tabs";
import { Card, EmptyState, Page, PageHeader, Pill, btnDanger, btnGhost, btnSecondary, input } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { platformCan } from "@/lib/platform-roles";
import { listReports, openReportCount } from "@/lib/reports";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

/** The moderators' queue: reports on clans and events, open first. */
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const me = await requirePlatform("reports");
  const t = await getT();
  const tab = (await searchParams).tab === "closed" ? "closed" : "open";
  const reports = listReports(tab);
  const open = openReportCount();
  const canSuspend = platformCan(me, "suspend");

  const clanIds = [...new Set(reports.map((r) => r.clanId).filter((x): x is string => !!x))];
  const clans = new Map(
    (clanIds.length ? db.select().from(schema.clan).where(inArray(schema.clan.id, clanIds)).all() : []).map((c) => [c.id, c]),
  );
  const people = getDefaultNames(reports.flatMap((r) => [r.reporterId, r.handledBy]).filter((x): x is string => !!x));
  const who = (id: string | null) => (id ? (people.get(id)?.full ?? t("moderation.deletedUser")) : t("moderation.deletedUser"));

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/admin" className="hover:text-fg">
            {t("adminLog.platformAdmin")}
          </Link>
        }
        title={t("moderation.reports")}
        subtitle={t("moderation.subtitle")}
        actions={
          <Link href="/admin" className={btnSecondary}>
            {t("adminLog.back")}
          </Link>
        }
      />
      <Tabs
        label={t("moderation.reports")}
        tabs={[
          { id: "open", label: t("moderation.open"), badge: open ? String(open) : undefined },
          { id: "closed", label: t("moderation.closed") },
        ]}
        active={tab}
        hrefFor={(id) => `/admin/reports?tab=${id}`}
      />
      {reports.length === 0 ? (
        <EmptyState icon="box" title={t(tab === "open" ? "moderation.emptyOpen" : "moderation.emptyClosed")}>
          {t("moderation.emptyText")}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const c = r.clanId ? clans.get(r.clanId) : undefined;
            const href = r.lanId ? `/lans/${r.lanId}` : c ? `/clans/${c.slug}` : null;
            return (
              <Card key={r.id}>
                <div className="space-y-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted">
                        {t(r.lanId ? "moderation.kindEvent" : "moderation.kindClan")}
                        {r.lanId && c ? ` · ${c.name}` : ""}
                      </p>
                      <p className="text-base font-semibold">
                        {href ? (
                          <Link href={href} className="hover:text-bit">
                            {r.subject}
                          </Link>
                        ) : (
                          <>
                            {r.subject} <span className="text-xs font-normal text-faint">{t("moderation.gone")}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className="flex flex-wrap gap-1.5">
                      <Pill tone="amber">{t(`report.reasons.${r.reason}`)}</Pill>
                      {r.status !== "open" && <Pill tone={r.status === "resolved" ? "emerald" : "zinc"}>{t(`moderation.status.${r.status}`)}</Pill>}
                      {c?.suspendedAt && <Pill tone="red">{t("moderation.clanSuspended")}</Pill>}
                    </span>
                  </div>
                  {r.message && <p className="whitespace-pre-wrap rounded-md bg-raised p-3">{r.message}</p>}
                  <p className="text-xs text-muted">{t("moderation.reportedBy", { name: who(r.reporterId), date: fmtDate(r.createdAt, t.locale) })}</p>
                  {r.status === "open" ? (
                    <form className="space-y-2">
                      <textarea name="note" rows={2} maxLength={2000} className={input} placeholder={t("moderation.notePlaceholder")} aria-label={t("moderation.note")} />
                      <div className="flex flex-wrap gap-2">
                        <button formAction={updateReport.bind(null, r.id, "resolved")} className={btnSecondary}>
                          {t("moderation.resolve")}
                        </button>
                        <button formAction={updateReport.bind(null, r.id, "dismissed")} className={btnGhost}>
                          {t("moderation.dismiss")}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted">
                        {t("moderation.handledBy", { name: who(r.handledBy), date: r.handledAt ? fmtDate(r.handledAt, t.locale) : "" })}
                      </p>
                      {r.note && <p className="whitespace-pre-wrap text-muted">{r.note}</p>}
                      <form action={updateReport.bind(null, r.id, "open")}>
                        <button className={btnGhost}>{t("moderation.reopen")}</button>
                      </form>
                    </div>
                  )}
                  {canSuspend && c && (
                    <div className="border-t border-line pt-3">
                      {c.suspendedAt ? (
                        <form action={unsuspendClanAction.bind(null, c.id)}>
                          <button className={btnGhost}>{t("moderation.restoreClan", { name: c.name })}</button>
                        </form>
                      ) : (
                        <details>
                          <summary className={`${btnGhost} cursor-pointer list-none !text-danger`}>{t("moderation.suspendClan", { name: c.name })}</summary>
                          <form action={suspendClanAction.bind(null, c.id)} className="mt-2 flex flex-wrap gap-2">
                            <input name="reason" className={`${input} min-w-0 flex-1`} placeholder={t("moderation.reasonPlaceholder")} maxLength={500} />
                            <button className={btnDanger}>{t("moderation.suspend")}</button>
                          </form>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
