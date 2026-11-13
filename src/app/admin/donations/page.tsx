import Link from "next/link";
import { Card, EmptyState, Notice, Page, PageHeader, Pill, StatTile, btnSecondary } from "@/components/ui";
import { DONATIONS_PAGE, adminDonations, donationProblems, donationsEnabled } from "@/lib/donations";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { requirePlatform } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Platform admins: every one-off donation, newest first, with totals per currency. */
export default async function AdminDonationsPage({ searchParams }: PageProps<"/admin/donations">) {
  await requirePlatform("owner");
  const t = await getT();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page) || 0);
  const { rows, totals, count } = adminDonations(page);
  const names = getDefaultNames(rows.map((r) => r.d.userId).filter((x): x is string => !!x));
  const pages = Math.max(1, Math.ceil(count / DONATIONS_PAGE));
  const problems = donationProblems();

  return (
    <Page>
      <PageHeader
        eyebrow={
          <Link href="/admin" className="hover:text-fg">
            {t("adminLog.platformAdmin")}
          </Link>
        }
        title={t("adminDonations.title")}
        subtitle={t("adminDonations.subtitle")}
        actions={
          <Link href="/admin/settings?tab=billing" className={btnSecondary}>
            {t("adminDonations.settings")}
          </Link>
        }
      />
      {!donationsEnabled() && <Notice tone="warn">{problems.length ? t("adminSettings.missing", { list: problems.join(", ") }) : t("adminDonations.off")}</Notice>}

      {totals.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {totals.map((x) => (
            <StatTile
              key={x.currency}
              label={t("adminDonations.total", { currency: x.currency })}
              value={fmtMoney(x.total, x.currency)}
              sub={t("adminDonations.thisYear", { amount: fmtMoney(x.thisYear, x.currency), count: x.count })}
            />
          ))}
        </div>
      )}

      <Card title={`${t("adminDonations.title")} (${count})`}>
        {rows.length === 0 ? (
          <EmptyState title={t("adminDonations.none")} />
        ) : (
          <ul className="-my-1 divide-y divide-line">
            {rows.map(({ d, clanName, clanSlug }) => (
              <li key={d.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {d.userId ? (names.get(d.userId)?.full ?? t("audit.removedPerson")) : t("audit.removedPerson")}
                    {clanName && (
                      <>
                        {" · "}
                        <Link href={`/clans/${clanSlug}`} className="text-bit hover:underline">
                          {clanName}
                        </Link>
                      </>
                    )}
                  </span>
                  <span className="block text-xs text-muted">{fmtDate(d.createdAt, t.locale)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {d.refundedAt && <Pill tone="red">{t("adminDonations.refunded")}</Pill>}
                  {!d.showBadge && <Pill>{t("adminDonations.noBadge")}</Pill>}
                  <span className={`font-semibold tabular-nums ${d.refundedAt ? "text-faint line-through" : ""}`}>{fmtMoney(d.amount, d.currency)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {page > 0 ? (
              <Link href={`/admin/donations?page=${page - 1}`} className={btnSecondary}>
                {t("adminDonations.newer")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-muted">{t("adminDonations.page", { page: page + 1, pages })}</span>
            {page + 1 < pages ? (
              <Link href={`/admin/donations?page=${page + 1}`} className={btnSecondary}>
                {t("adminDonations.older")}
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </Card>
    </Page>
  );
}
