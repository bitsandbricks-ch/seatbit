import Link from "next/link";
import type { Clan } from "@/db/schema";
import { manageSupport, startSupport } from "@/app/billing-actions";
import { availablePlans, billingEnabled, isSupporter, priceLabel } from "@/lib/billing";
import { fmtDay } from "@/lib/format";
import { getLegal } from "@/lib/legal";
import { Card, Notice, btnPrimary, btnSecondary } from "./ui";

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

  return (
    <Card title="Support Seatbit">
      <div className="space-y-3 text-sm">
        {status === "thanks" && (
          <Notice>Thank you! The Supporter badge shows up as soon as Stripe confirms the payment, usually within a minute.</Notice>
        )}
        {status === "error" && <Notice tone="danger">Stripe couldn&apos;t be reached. Please try again in a moment.</Notice>}

        {supporter && c.supporterUntil ? (
          <>
            <p className="flex items-center gap-2 font-medium text-bit">
              <span aria-hidden>♥</span> {c.name} is a Supporter
            </p>
            <p className="text-muted">
              Thank you for helping to keep Seatbit running.{" "}
              {c.stripeSubscriptionId
                ? `Paid until ${fmtDay(c.supporterUntil)}, then it renews ${c.supporterPlan === "month" ? "monthly" : "yearly"} until you cancel.`
                : `Paid until ${fmtDay(c.supporterUntil)}. It doesn't renew.`}
            </p>
          </>
        ) : (
          <>
            <p className="text-muted">
              Seatbit is free, with every feature, for every clan. If it helps your group, you can support{" "}
              {operator ? `${operator}, who runs this Seatbit,` : "the people who run this Seatbit"} with a voluntary
              payment. Your clan gets a Supporter badge and our thanks; nothing else changes.
            </p>
            <div className="flex flex-wrap gap-2">
              {plans.map((p) => (
                <form key={p} action={startSupport.bind(null, c.id, p)}>
                  <button className={p === "year" ? btnPrimary : btnSecondary}>
                    {labels[p] ?? (p === "year" ? "Support yearly" : "Support monthly")}
                  </button>
                </form>
              ))}
            </div>
            <p className="text-xs text-faint">
              Paid through Stripe. Cancel any time, see the{" "}
              <Link href="/terms#payments" className="text-bit hover:underline">
                terms
              </Link>
              .
            </p>
          </>
        )}

        {c.stripeCustomerId && (
          <form action={manageSupport.bind(null, c.id)}>
            <button className={btnSecondary}>{supporter ? "Manage or cancel" : "Past payments"}</button>
          </form>
        )}
      </div>
    </Card>
  );
}

/** Small "Supporter" mark next to a clan's name. */
export function SupporterBadge() {
  return (
    <span
      title="This clan supports Seatbit"
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-bit border border-bit/30 bg-bit-soft px-1.5 py-0.5 text-xs font-medium text-bit"
    >
      <span aria-hidden>♥</span> Supporter
    </span>
  );
}
