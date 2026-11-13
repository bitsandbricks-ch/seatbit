import { notFound, redirect } from "next/navigation";
import { Card, Columns, Page, PageHeader, StatTile, btnDanger, btnSecondary } from "@/components/ui";
import { AddPeopleForm, ChargeEditForm, ChargeLines, type LineView } from "@/components/payment-forms";
import { deleteCharge, remindCharge } from "@/app/payment-actions";
import { clanCan, getClanBySlug } from "@/lib/clans";
import { fmtDate, fmtDay, toInputValue } from "@/lib/format";
import { getDefaultNames } from "@/lib/lans";
import { fmtAmount } from "@/lib/money";
import { PAYMENT_REMINDER_DAYS, chargeablePeople, chargeDetail } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { getT } from "@/i18n/server";
import { ActionForm } from "@/components/action-form";

export default async function ChargePage({ params }: PageProps<"/clans/[slug]/payments/[id]">) {
  const { slug, id } = await params;
  const me = await requireUser();
  const t = await getT();
  const c = getClanBySlug(slug);
  if (!c) notFound();
  if (!clanCan(me, c.id, "payments")) redirect(`/clans/${slug}`);
  const d = chargeDetail(id);
  if (!d || d.charge.clanId !== c.id) notFound();
  const { charge: ch, items } = d;

  const onCharge = new Set(items.map((i) => i.userId));
  const others = chargeablePeople(c.id).filter((u) => !onCharge.has(u));
  const names = getDefaultNames([...items.flatMap((i) => [i.userId, i.markedBy ?? ""]), ...others].filter(Boolean), c.nameDisplay);
  const nameOf = (uid: string) => names.get(uid) ?? { label: t("audit.removedPerson"), full: t("audit.removedPerson"), verified: false, nick: "" };

  const lines: LineView[] = items.map((i) => {
    const n = nameOf(i.userId);
    const by = i.markedBy && i.markedBy !== i.userId ? t("payments.by", { name: nameOf(i.markedBy).label }) : "";
    const detail =
      i.status === "paid"
        ? [i.paidVia ? t(`payments.viaDone.${i.paidVia}`) : "", i.paidAt ? fmtDate(i.paidAt, t.locale) : "", by].filter(Boolean).join(" · ")
        : i.status === "waived"
          ? [t("payments.status.waived"), by].filter(Boolean).join(" · ")
          : i.status === "reported"
            ? t("payments.saysPaid")
            : i.remindedAt
              ? t("payments.reminded", { date: fmtDate(i.remindedAt, t.locale) })
              : "";
    return { id: i.id, name: n.label, full: n.full, guest: !n.verified, amountCents: i.amountCents, status: i.status, detail };
  });
  const people = others
    .map((uid) => ({ id: uid, label: nameOf(uid).label, full: nameOf(uid).full, guest: !nameOf(uid).verified }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const open = items.filter((i) => i.status === "open").length;
  const typical = items[0] ? (items[0].amountCents / 100).toFixed(2) : "";

  return (
    <Page>
      <PageHeader
        back={{ href: `/clans/${c.slug}/settings?tab=payments`, label: t("payments.title") }}
        eyebrow={t(`payments.kind.${ch.kind}`)}
        title={ch.title}
        subtitle={[ch.lanName, ch.dueAt && t("payments.dueOn", { date: fmtDay(ch.dueAt) })].filter(Boolean).join(" · ") || undefined}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={t("payments.collected")} value={fmtAmount(ch.collectedCents, ch.currency)} sub={t("payments.ofTotal", { total: fmtAmount(ch.totalCents, ch.currency) })} />
        <StatTile label={t("payments.paidCount")} value={`${ch.paid} / ${ch.people}`} sub={ch.people - ch.paid - ch.owed ? t("payments.waivedCount", { count: ch.people - ch.paid - ch.owed }) : undefined} />
        <StatTile label={t("payments.stillOpen")} value={String(ch.owed)} sub={ch.reported ? t("payments.toCheck", { count: ch.reported }) : undefined} />
      </div>
      <Columns
        aside={
          <>
            <Card title={t("payments.remind")}>
              <p className="mb-3 text-sm text-muted">
                {ch.dueAt ? t("payments.remindAuto", { days: PAYMENT_REMINDER_DAYS }) : t("payments.remindNoDue")} {t("payments.remindHint")}
              </p>
              <ActionForm action={remindCharge.bind(null, ch.id)}>
                <button disabled={!open} className={btnSecondary}>
                  {t("payments.remindNow", { count: open })}
                </button>
              </ActionForm>
            </Card>
            <Card title={t("payments.addPeople")}>
              <AddPeopleForm chargeId={ch.id} people={people} amount={typical} />
            </Card>
            <Card title={t("payments.edit")}>
              <ChargeEditForm chargeId={ch.id} title={ch.title} note={ch.note} dueAt={toInputValue(ch.dueAt)} />
            </Card>
            <Card title={t("manage.dangerZone")}>
              <p className="mb-3 text-sm text-muted">{t("payments.deleteHint")}</p>
              <ActionForm action={deleteCharge.bind(null, ch.id)} done="deleted">
                <button className={btnDanger}>{t("payments.delete")}</button>
              </ActionForm>
            </Card>
          </>
        }
      >
        <Card title={t("payments.people", { count: ch.people })}>
          {ch.note && <p className="mb-3 whitespace-pre-wrap text-sm text-muted">{ch.note}</p>}
          <ChargeLines chargeId={ch.id} currency={ch.currency} lines={lines} />
        </Card>
      </Columns>
    </Page>
  );
}
