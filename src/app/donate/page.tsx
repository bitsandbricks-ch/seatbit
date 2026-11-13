import Link from "next/link";
import { notFound } from "next/navigation";
import { startDonation } from "@/app/billing-actions";
import { Card, Columns, Notice, Page, PageHeader, btnPrimary, input, label } from "@/components/ui";
import { clanCan, myClans } from "@/lib/clans";
import { DONATION_MAX, DONATION_MIN, donationOptions, donationsEnabled, myDonations, supporterYearAmount } from "@/lib/donations";
import { fmtDay, fmtMoney } from "@/lib/format";
import { getLegal } from "@/lib/legal";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function DonatePage({ searchParams }: PageProps<"/donate">) {
  if (!donationsEnabled()) notFound();
  const me = await requireUser({ next: "/donate" });
  const sp = await searchParams;
  const t = await getT();
  const { amounts, currency } = donationOptions();
  const clans = myClans(me.id)
    .map((r) => r.clan)
    .filter((c) => clanCan(me, c.id, "settings"));
  const year = await supporterYearAmount();
  const past = myDonations(me.id).slice(0, 10);
  const operator = getLegal().operatorName;
  const middle = amounts[Math.floor((amounts.length - 1) / 2)];

  return (
    <Page>
      <PageHeader title={t("donate.title")} subtitle={operator ? t("donate.subtitleOperator", { operator }) : t("donate.subtitle")} />
      {sp.donate === "error" && <Notice tone="danger">{t("support.error")}</Notice>}
      {sp.donate === "amount" && <Notice tone="danger">{t("donate.badAmount", { min: DONATION_MIN, max: DONATION_MAX, currency })}</Notice>}
      <Columns
        aside={
          <>
            <Card title={t("donate.whatTitle")}>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                <li>{t("donate.what1")}</li>
                <li>{t("donate.what2")}</li>
                {year && <li>{t("donate.what3", { amount: fmtMoney(year.amount, year.currency) })}</li>}
                <li>{t("donate.what4")}</li>
              </ul>
            </Card>
            {past.length > 0 && (
              <Card title={t("donate.yours")}>
                <ul className="-my-1 divide-y divide-line text-sm">
                  {past.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-muted">{fmtDay(d.createdAt)}</span>
                      <span className={d.refundedAt ? "text-faint line-through" : "font-medium"}>{fmtMoney(d.amount, d.currency)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        }
      >
        <Card title={t("donate.formTitle")}>
          <form action={startDonation} className="space-y-5">
            <fieldset>
              <legend className={label}>{t("donate.amount")}</legend>
              <div className="flex flex-wrap gap-2">
                {amounts.map((a) => (
                  <label key={a} className="cursor-pointer">
                    <input type="radio" name="amount" value={a} defaultChecked={a === middle} className="peer sr-only" />
                    <span className="inline-flex min-h-11 min-w-20 items-center justify-center rounded-bit border border-line bg-raised px-4 text-sm font-medium transition peer-checked:border-bit peer-checked:bg-bit-soft peer-checked:text-bit peer-focus-visible:outline-2 peer-focus-visible:outline-bit">
                      {currency} {a}
                    </span>
                  </label>
                ))}
              </div>
              <label className="mt-3 block max-w-60">
                <span className="mb-1.5 block text-xs text-muted">{t("donate.custom", { currency })}</span>
                <input
                  name="custom"
                  inputMode="decimal"
                  pattern="[0-9]+([.,][0-9]{1,2})?"
                  placeholder={t("donate.customPlaceholder")}
                  className={input}
                  aria-label={t("donate.custom", { currency })}
                />
              </label>
            </fieldset>

            {clans.length > 0 && (
              <label className="block max-w-sm">
                <span className={label}>{t("donate.for")}</span>
                <select name="for" defaultValue="" className={input}>
                  <option value="">{t("donate.forMe")}</option>
                  {clans.map((c) => (
                    <option key={c.id} value={c.id}>
                      {t("donate.forClan", { clan: c.name })}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs text-muted">{t(year ? "donate.forHintSupporter" : "donate.forHint")}</span>
              </label>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm">
              <input type="checkbox" name="badge" defaultChecked className="mt-0.5" />
              <span>
                {t("donate.badge")}
                <span className="block text-xs text-muted">{t("donate.badgeHint")}</span>
              </span>
            </label>

            <div className="space-y-2">
              <button className={btnPrimary}>{t("donate.submit")}</button>
              <p className="text-xs text-faint">
                {t.rich("donate.stripe", {
                  terms: (
                    <Link href="/terms#payments" className="text-bit hover:underline">
                      {t("support.terms")}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </form>
        </Card>
      </Columns>
    </Page>
  );
}
