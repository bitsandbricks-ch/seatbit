import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, Page, PageHeader, btnPrimary, btnSecondary } from "@/components/ui";
import { confirmDonation, donationsEnabled } from "@/lib/donations";
import { fmtMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

/** Where Stripe sends people after paying. Confirms the payment itself, in case the webhook is slower. */
export default async function DonateThanksPage({ searchParams }: PageProps<"/donate/thanks">) {
  if (!donationsEnabled()) notFound();
  const sp = await searchParams;
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : "";
  const me = await requireUser({ next: `/donate/thanks?session_id=${encodeURIComponent(sessionId)}` });
  const t = await getT();
  const d = sessionId ? await confirmDonation(sessionId, me.id) : null;

  return (
    <Page>
      <PageHeader title={t("donate.thanksTitle")} />
      <Card>
        <div className="space-y-4 text-sm">
          {!d ? (
            <Notice tone="warn">{t("donate.unknown")}</Notice>
          ) : (
            <>
              <p className="flex items-center gap-2 text-base font-medium text-bit">
                <span aria-hidden>♥</span>
                {d.clan
                  ? t("donate.thanksClan", { amount: fmtMoney(d.amount, d.currency), clan: d.clan.name })
                  : t("donate.thanksMe", { amount: fmtMoney(d.amount, d.currency) })}
              </p>
              {!d.paid && <Notice>{t("donate.pending")}</Notice>}
              {d.grantsSupporter && d.clan && <p className="text-muted">{t("donate.grantedSupporter", { clan: d.clan.name })}</p>}
              <p className="text-muted">{t("donate.receipt")}</p>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={btnPrimary}>
              {t("donate.home")}
            </Link>
            {d?.clan && (
              <Link href={`/clans/${d.clan.slug}`} className={btnSecondary}>
                {d.clan.name}
              </Link>
            )}
          </div>
        </div>
      </Card>
    </Page>
  );
}
