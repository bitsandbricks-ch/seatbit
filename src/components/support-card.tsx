import Link from "next/link";
import type { Clan } from "@/db/schema";
import { manageSupport, startSupport } from "@/app/billing-actions";
import { availablePlans, billingEnabled, isSupporter, priceLabel } from "@/lib/billing";
import { donationsEnabled } from "@/lib/donations";
import { fmtDay } from "@/lib/format";
import { getLegal } from "@/lib/legal";
import { Card, Notice, btnPrimary, btnSecondary } from "./ui";
import { getT } from "@/i18n/server";

/**
 * "Support Seatbit" in the clan settings, for clan admins. Only there when the operator turned
 * Supporter payments on. Voluntary: nothing in the app depends on it, so it never nags.
 */
export async function SupportCard({ clan: c, status }: { clan: Clan; status?: string }) {
  if (!billingEnabled()) return null;
  const supporter = isSupporter(c);
  const plans = availablePlans();
  const labels = Object.fromEntries(await Promise.all(plans.map(async (p) => [p, await priceLabel(p)] as const)));
  const operator = getLegal().operatorName;
  const t = await getT();

  return (
    <Card title={t("support.title")}>
      <div className="space-y-3 text-sm">
        {status === "thanks" && (
          <Notice>{t("support.thanks")}</Notice>
        )}
        {status === "error" && <Notice tone="danger">{t("support.error")}</Notice>}

        {supporter && c.supporterUntil ? (
          <>
            <p className="flex items-center gap-2 font-medium text-bit">
              <span aria-hidden>♥</span> {t("support.isSupporter", { clan: c.name })}
            </p>
            <p className="text-muted">
              {t("support.thankYou")}{" "}
              {c.stripeSubscriptionId
                ? t(c.supporterPlan === "month" ? "support.renewsMonthly" : "support.renewsYearly", { date: fmtDay(c.supporterUntil) })
                : t("support.noRenew", { date: fmtDay(c.supporterUntil) })}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted">
              {operator ? t("support.pitchOperator", { operator }) : t("support.pitch")}
            </p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <form key={p} action={startSupport.bind(null, c.id, p)}>
                  <button className={p === "year" ? btnPrimary : btnSecondary}>
                    {labels[p] ? `${labels[p]} / ${t(p === "year" ? "support.year" : "support.month")}` : t(p === "year" ? "support.yearly" : "support.monthly")}
                  </button>
                </form>
              ))}
            </div>
            <p className="text-xs text-faint">
              {t.rich("support.stripe", {
                terms: (
                  <Link href="/terms#payments" className="text-bit hover:underline">
                    {t("support.terms")}
                  </Link>
                ),
              })}
            </p>
          </>
        )}

        {donationsEnabled() && (
          <p className="text-xs text-muted">
            {t.rich("support.oneOff", {
              link: (
                <Link href="/donate" className="text-bit hover:underline">
                  {t("support.oneOffLink")}
                </Link>
              ),
            })}
          </p>
        )}

        {c.stripeCustomerId && (
          <form action={manageSupport.bind(null, c.id)}>
            <button className={btnSecondary}>{t(supporter ? "support.manage" : "support.past")}</button>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Small "Supporter" mark next to a clan's name. */
export function SupporterBadge({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-bit border border-bit/30 bg-bit-soft px-1.5 py-0.5 text-xs font-medium text-bit"
    >
      <span aria-hidden>♥</span> Supporter
    </span>
  );
}

/** Small "Donor" mark for a person or clan who gave a one-off donation in the last year. */
export function DonorBadge({ label, title }: { label: string; title: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-bit border border-bit/30 bg-bit-soft px-1.5 py-0.5 text-xs font-medium text-bit"
    >
      <span aria-hidden>♥</span> {label}
    </span>
  );
}
