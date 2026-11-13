import Link from "next/link";
import { Card, Page, PageHeader, Segmented, StatTile, halves } from "@/components/ui";
import { UsageChart, type UsagePoint } from "@/components/usage-chart";
import { fmtDay } from "@/lib/format";
import { requirePlatform } from "@/lib/session";
import { USAGE_RANGES, type UsageBucket, type UsageRange, usageStats } from "@/lib/usage";
import { getT } from "@/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: `${(await getT())("usage.title")} · Seatbit` };
}

/** Platform admins: how much this instance is used (accounts, active people, clans, events) over time. */
export default async function UsageStatsPage({ searchParams }: PageProps<"/admin/stats">) {
  await requirePlatform("view");
  const t = await getT();
  const { range: raw } = await searchParams;
  const range: UsageRange = USAGE_RANGES.includes(raw as UsageRange) ? (raw as UsageRange) : "months";
  const { buckets, totals } = usageStats(range);
  const weeks = range === "weeks";
  const month = new Intl.DateTimeFormat(t.locale, { month: "short" });
  const monthYear = new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" });
  const label = (b: UsageBucket) =>
    weeks ? fmtDay(b.start).slice(0, 6) : b.start.getMonth() === 0 ? String(b.start.getFullYear()) : month.format(b.start);
  const title = (b: UsageBucket) => (weeks ? t("usage.weekOf", { day: fmtDay(b.start) }) : monthYear.format(b.start));
  const point = (b: UsageBucket, value: number, total?: number, note?: string): UsagePoint => ({
    key: b.start.toISOString(),
    label: label(b),
    title: title(b),
    value,
    total,
    note,
  });

  return (
    <Page>
      <PageHeader
        back={{ href: "/admin", label: t("adminLog.platformAdmin") }}
        title={t("usage.title")}
        subtitle={t("usage.subtitle")}
        actions={
          <Segmented
            label={t("usage.range")}
            value={range}
            options={USAGE_RANGES.map((r) => ({ id: r, label: t(`usage.ranges.${r}`), href: `/admin/stats?range=${r}` }))}
          />
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <StatTile
          label={t("usage.accounts")}
          value={String(totals.users)}
          sub={t("usage.new30", { count: totals.newUsers30 })}
        />
        <StatTile
          label={t("usage.active30")}
          value={String(totals.active30)}
          sub={totals.users ? t("usage.ofAccounts", { pct: Math.round((totals.active30 / totals.users) * 100) }) : undefined}
        />
        <StatTile label={t("usage.clans")} value={String(totals.clans)} sub={t("usage.activeClans30", { count: totals.activeClans30 })} />
        <StatTile label={t("usage.upcoming")} value={String(totals.upcoming)} sub={t("usage.held12m", { count: totals.held12m })} />
      </div>

      <Card title={t("usage.people")}>
        <UsageChart
          t={t}
          totalLabel={t("usage.accounts")}
          valueLabel={t("usage.active")}
          points={buckets.map((b) => point(b, b.activeUsers, b.users, t("usage.newN", { count: b.newUsers })))}
        />
      </Card>

      <div className={halves}>
        <Card title={t("usage.clans")}>
          <UsageChart
            t={t}
            totalLabel={t("usage.allClans")}
            valueLabel={t("usage.active")}
            points={buckets.map((b) => point(b, b.activeClans, b.clans))}
          />
        </Card>
        <Card title={t("usage.events")}>
          <UsageChart
            t={t}
            valueLabel={t("usage.eventsHeld")}
            points={buckets.map((b) => point(b, b.events, undefined, t("usage.attendeesN", { count: b.attendees })))}
          />
        </Card>
      </div>

      <Card title={t("usage.table")}>
        <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
          <table className="w-full min-w-[36rem] text-sm tabular-nums">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">{t(weeks ? "usage.week" : "usage.month")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.accounts")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.newCol")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.active")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.clans")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.activeClansCol")}</th>
                <th className="px-2 py-2 text-right font-medium">{t("usage.eventsHeld")}</th>
                <th className="py-2 pl-2 text-right font-medium">{t("usage.attendees")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...buckets].reverse().map((b) => (
                <tr key={b.start.toISOString()}>
                  <td className="py-2 pr-3 whitespace-nowrap">{title(b)}</td>
                  <td className="px-2 py-2 text-right">{b.users}</td>
                  <td className="px-2 py-2 text-right">{b.newUsers}</td>
                  <td className="px-2 py-2 text-right font-semibold">{b.activeUsers}</td>
                  <td className="px-2 py-2 text-right">{b.clans}</td>
                  <td className="px-2 py-2 text-right">{b.activeClans}</td>
                  <td className="px-2 py-2 text-right">{b.events}</td>
                  <td className="py-2 pl-2 text-right">{b.attendees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-faint">
          {t.rich("usage.foot", {
            guests: totals.guests,
            privacy: (
              <Link href="/privacy" className="underline">
                {t("footer.privacy")}
              </Link>
            ),
          })}
        </p>
      </Card>
    </Page>
  );
}
