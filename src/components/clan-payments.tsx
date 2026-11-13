import Link from "next/link";
import type { ChargeItemStatus, Clan } from "@/db/schema";
import { reportPaid } from "@/app/payment-actions";
import { fmtDate, fmtDay } from "@/lib/format";
import { fmtAmount } from "@/lib/money";
import { clanCharges, isOwed, type ChargeSummary, type MyLine } from "@/lib/payments";
import type { T } from "@/i18n/translate";
import { Card, Columns, EmptyState, Pill, btnGhost, btnPrimary, btnSecondary } from "./ui";
import { PaymentSettingsForm } from "./payment-forms";

const TONE: Record<ChargeItemStatus, "red" | "amber" | "emerald" | "zinc"> = { open: "red", reported: "amber", paid: "emerald", waived: "zinc" };

export function LineStatus({ t, status }: { t: T; status: ChargeItemStatus }) {
  return <Pill tone={TONE[status]}>{t(`payments.status.${status}`)}</Pill>;
}

/** The clan's payment details as members see them (IBAN, TWINT number, ...). */
export function PaymentInfo({ t, clan: c }: { t: T; clan: Pick<Clan, "paymentInfo"> }) {
  if (!c.paymentInfo) return <p className="text-sm text-muted">{t("payments.noInfo")}</p>;
  return <p className="whitespace-pre-wrap break-words rounded-md border border-line bg-raised p-3 font-mono text-sm">{c.paymentInfo}</p>;
}

/** Manage → Payments: the switch, how members pay, and every charge with how many have paid. */
export function PaymentsManageTab({ t, clan: c }: { t: T; clan: Clan }) {
  const charges = c.paymentsEnabled ? clanCharges(c.id) : [];
  const open = charges.filter((x) => x.owed > 0);
  const done = charges.filter((x) => x.owed === 0);
  return (
    <Columns
      aside={
        <Card title={t("payments.settings")}>
          <PaymentSettingsForm clanId={c.id} enabled={c.paymentsEnabled} info={c.paymentInfo} />
        </Card>
      }
    >
      {!c.paymentsEnabled ? (
        <EmptyState icon="box" title={t("payments.offTitle")}>
          {t("payments.offText")}
        </EmptyState>
      ) : (
        <>
          <Card
            title={t("payments.charges")}
            actions={
              <Link href={`/clans/${c.slug}/payments/new`} className={btnPrimary}>
                <span aria-hidden>+</span> {t("payments.newCharge")}
              </Link>
            }
          >
            {open.length === 0 ? (
              <p className="text-sm text-muted">{t(charges.length ? "payments.allSettled" : "payments.noCharges")}</p>
            ) : (
              <ChargeList t={t} slug={c.slug} charges={open} />
            )}
          </Card>
          {done.length > 0 && (
            <Card title={t("payments.settled")}>
              <ChargeList t={t} slug={c.slug} charges={done} />
            </Card>
          )}
        </>
      )}
    </Columns>
  );
}

function ChargeList({ t, slug, charges }: { t: T; slug: string; charges: ChargeSummary[] }) {
  return (
    <ul className="divide-y divide-line">
      {charges.map((ch) => {
        const pct = ch.people ? Math.round(((ch.people - ch.owed) / ch.people) * 100) : 100;
        return (
          <li key={ch.id}>
            <Link href={`/clans/${slug}/payments/${ch.id}`} className="-mx-2 block rounded-md p-2 transition hover:bg-raised">
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{ch.title}</span>
                  <Pill>{t(`payments.kind.${ch.kind}`)}</Pill>
                  {ch.reported > 0 && <Pill tone="amber">{t("payments.toCheck", { count: ch.reported })}</Pill>}
                </span>
                <span className="text-sm tabular-nums text-muted">
                  {fmtAmount(ch.collectedCents, ch.currency)} / {fmtAmount(ch.totalCents, ch.currency)}
                </span>
              </span>
              <span className="mt-1 block truncate text-xs text-muted">
                {[
                  t("payments.paidOf", { paid: ch.people - ch.owed, count: ch.people }),
                  ch.lanName,
                  ch.dueAt && t("payments.dueOn", { date: fmtDay(ch.dueAt) }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <span className="block h-full rounded-full bg-bit" style={{ width: `${pct}%` }} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A member's own lines: what's owed with an "I've paid" button, then what's done. */
export function MyPayments({ t, clan: c, lines }: { t: T; clan: Clan; lines: MyLine[] }) {
  const owed = lines.filter((l) => isOwed(l.status));
  const done = lines.filter((l) => !isOwed(l.status));
  return (
    <Columns
      aside={
        <Card title={t("payments.howToPay")}>
          <PaymentInfo t={t} clan={c} />
        </Card>
      }
    >
      <Card title={t("payments.toPay")}>
        {owed.length === 0 ? (
          <p className="text-sm text-muted">{t("payments.nothingOpen")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {owed.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <LineText t={t} line={l} />
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">{fmtAmount(l.amountCents, l.charge.currency)}</span>
                  {l.status === "open" ? (
                    <form action={reportPaid.bind(null, l.id, true)}>
                      <button className={btnSecondary}>{t("payments.iPaid")}</button>
                    </form>
                  ) : (
                    <form action={reportPaid.bind(null, l.id, false)} className="flex items-center gap-1">
                      <LineStatus t={t} status={l.status} />
                      <button className={`${btnGhost} text-xs`}>{t("payments.undoReport")}</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {owed.some((l) => l.status === "reported") && <p className="mt-3 text-xs text-faint">{t("payments.reportedHint")}</p>}
      </Card>
      {done.length > 0 && (
        <Card title={t("payments.history")}>
          <ul className="divide-y divide-line">
            {done.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <LineText t={t} line={l} />
                <span className="flex items-center gap-2">
                  <span className="tabular-nums text-muted">{fmtAmount(l.amountCents, l.charge.currency)}</span>
                  <LineStatus t={t} status={l.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Columns>
  );
}

function LineText({ t, line: l }: { t: T; line: MyLine }) {
  return (
    <span className="min-w-0">
      <span className="block truncate font-medium">{l.charge.title}</span>
      <span className="block truncate text-xs text-muted">
        {[
          l.lanName,
          l.status === "paid" && l.paidAt
            ? t("payments.paidOn", { date: fmtDate(l.paidAt, t.locale) })
            : l.charge.dueAt && t("payments.dueOn", { date: fmtDay(l.charge.dueAt) }),
          l.charge.note,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

/** "What you owe for this event", in the event sidebar. */
export function EventPaymentsCard({ t, clan: c, lines }: { t: T; clan: Clan; lines: MyLine[] }) {
  if (!lines.length) return null;
  return (
    <Card
      title={t("payments.forEvent")}
      actions={
        <Link href={`/clans/${c.slug}?tab=payments`} className="text-sm text-bit hover:underline">
          {t("payments.allPayments")}
        </Link>
      }
    >
      <ul className="space-y-2 text-sm">
        {lines.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{l.charge.title}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="tabular-nums">{fmtAmount(l.amountCents, l.charge.currency)}</span>
              <LineStatus t={t} status={l.status} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
