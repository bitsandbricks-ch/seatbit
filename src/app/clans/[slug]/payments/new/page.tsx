import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { Card, Columns, Page, PageHeader } from "@/components/ui";
import { ChargeForm } from "@/components/payment-forms";
import { PaymentInfo } from "@/components/clan-payments";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { foodCurrency } from "@/lib/food";
import { lanDay } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { chargeablePeople, clanPaymentsOn, goingTo } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function NewChargePage({ params, searchParams }: PageProps<"/clans/[slug]/payments/new">) {
  const { slug } = await params;
  const sp = await searchParams;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "payments") || !clanPaymentsOn(c)) redirect(`/clans/${slug}/settings?tab=payments`);

  const ids = chargeablePeople(c.id);
  const names = getDefaultNames(ids, c.nameDisplay);
  const people = ids
    .map((id) => {
      const n = names.get(id);
      return { id, label: n?.label ?? "?", full: n?.full ?? "?", guest: !n?.verified };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  // Events still to come and those of the last half year: ticket money is often settled afterwards.
  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const events = db
    .select()
    .from(schema.lan)
    .where(and(eq(schema.lan.clanId, c.id), gt(schema.lan.endsAt, since)))
    .orderBy(desc(schema.lan.startsAt))
    .all()
    .map((l) => ({ id: l.id, name: l.name, when: lanDay(l, t.locale), going: goingTo(l.id) }));
  const lan = typeof sp.lan === "string" && events.some((e) => e.id === sp.lan) ? sp.lan : undefined;

  return (
    <Page>
      <PageHeader back={{ href: `/clans/${c.slug}/settings?tab=payments`, label: t("payments.title") }} title={t("payments.newCharge")} subtitle={t("payments.newSubtitle")} />
      <Columns
        aside={
          <Card title={t("payments.howToPay")}>
            <PaymentInfo t={t} clan={c} />
            <p className="mt-2 text-xs text-faint">{t("payments.infoWhere")}</p>
          </Card>
        }
      >
        <Card>
          <ChargeForm clanId={c.id} people={people} events={events} currency={foodCurrency()} lanId={lan} />
        </Card>
      </Columns>
    </Page>
  );
}
