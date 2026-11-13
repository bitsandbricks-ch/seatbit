"use client";
import { useState, useTransition } from "react";
import { useRunAction, useToastAction } from "./action-form";
import type { ChargeItemStatus, ChargeKind, PaidVia } from "@/db/schema";
import {
  addToCharge,
  createCharge,
  markLinesPaid,
  removeLine,
  savePaymentSettings,
  setLineAmount,
  setLineStatus,
  updateCharge,
} from "@/app/payment-actions";
import { fmtAmount, parseAmount, splitCents } from "@/lib/money";
import { useT } from "@/i18n/client";
import { DateTimePicker } from "./date-time-picker";
import { Field, Input, Pill, Segmented, Verified, btnGhost, btnPrimary, btnSecondary, input, label } from "./ui";

const textarea = `${input} min-h-20`;

/** Manage → Payments sidebar: payments on or off for the clan, and how members pay. */
export function PaymentSettingsForm({ clanId, enabled, info }: { clanId: string; enabled: boolean; info: string }) {
  const t = useT();
  const [, action, pending] = useToastAction(savePaymentSettings.bind(null, clanId), undefined);
  return (
    <form action={action} className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} className="mt-0.5 h-4 w-4 accent-bit" />
        <span>
          <span className="block font-medium">{t("payments.enable")}</span>
          <span className="block text-muted">{t("payments.enableHint")}</span>
        </span>
      </label>
      <Field label={t("payments.infoLabel")} hint={t("payments.infoHint")}>
        <textarea name="paymentInfo" defaultValue={info} maxLength={1000} rows={4} className={textarea} placeholder={t("payments.infoPlaceholder")} />
      </Field>
      <button disabled={pending} className={btnSecondary}>
        {t("common.save")}
      </button>
    </form>
  );
}

export type PersonOption = { id: string; label: string; full: string; guest: boolean };
export type EventOption = { id: string; name: string; when: string; going: string[] };

/** New charge: what for, who pays, how much. */
export function ChargeForm({
  clanId,
  people,
  events,
  currency,
  lanId: initialLan,
}: {
  clanId: string;
  people: PersonOption[];
  events: EventOption[];
  currency: string;
  lanId?: string;
}) {
  const t = useT();
  const [, action, pending] = useToastAction(createCharge.bind(null, clanId), undefined);
  const [kind, setKind] = useState<ChargeKind>(initialLan ? "event" : "dues");
  const [lanId, setLanId] = useState(initialLan ?? "");
  const [who, setWho] = useState<"members" | "going" | "pick">(initialLan ? "going" : "members");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [split, setSplit] = useState<"each" | "total">("each");
  const [cur, setCur] = useState(currency);

  const ev = events.find((e) => e.id === lanId);
  const whoOptions = kind === "dues" ? (["members", "pick"] as const) : (["members", "going", "pick"] as const);
  const effectiveWho = whoOptions.includes(who as never) ? who : "members";
  const count = effectiveWho === "members" ? people.length : effectiveWho === "going" ? (ev?.going.length ?? 0) : picked.size;
  const cents = parseAmount(amount);
  let preview: string | null = null;
  if (cents && !Number.isNaN(cents) && count) {
    preview =
      split === "each"
        ? t("payments.form.previewEach", { count, total: fmtAmount(cents * count, cur) })
        : t("payments.form.previewSplit", { count, each: fmtAmount(splitCents(cents, count).at(-1)!, cur) });
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <form action={action} className="space-y-5">
      <div>
        <span className={label}>{t("payments.form.kind")}</span>
        <Segmented
          label={t("payments.form.kind")}
          value={kind}
          onChange={setKind}
          options={(["dues", "event", "other"] as const).map((k) => ({ id: k, label: t(`payments.kind.${k}`) }))}
        />
        <input type="hidden" name="kind" value={kind} />
        <p className="mt-1.5 text-xs text-faint">{t(`payments.form.kindHint.${kind}`)}</p>
      </div>

      <Field label={t("payments.form.title")}>
        <Input name="title" required maxLength={80} placeholder={t(`payments.form.titlePlaceholder.${kind}`)} />
      </Field>

      {kind !== "dues" && (
        <Field label={kind === "event" ? t("payments.form.event") : t("payments.form.eventOptional")}>
          <select name="lanId" value={lanId} onChange={(e) => setLanId(e.target.value)} className={input} required={kind === "event"}>
            <option value="">{t("payments.form.noEvent")}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.when}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div>
        <span className={label}>{t("payments.form.who")}</span>
        <Segmented
          label={t("payments.form.who")}
          value={effectiveWho}
          onChange={setWho}
          options={whoOptions.map((w) => ({
            id: w,
            label: t(`payments.form.whoOption.${w}`),
            count: w === "members" ? people.length : w === "going" ? (ev?.going.length ?? 0) : picked.size,
          }))}
        />
        <input type="hidden" name="who" value={effectiveWho} />
        {effectiveWho === "going" && !ev && <p className="mt-1.5 text-xs text-warn">{t("payments.form.pickEvent")}</p>}
        {effectiveWho === "pick" && (
          <ul className="mt-2 grid max-h-72 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
            {people.map((p) => (
              <li key={p.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-raised">
                  <input type="checkbox" name="people" value={p.id} checked={picked.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-bit" />
                  <span className="min-w-0 truncate">{p.label}</span>
                  {!p.guest && <Verified />}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem]">
        <Field label={t("payments.form.amount")}>
          <Input name="amount" inputMode="decimal" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="30.00" />
        </Field>
        <Field label={t("payments.form.currency")}>
          <Input name="currency" required maxLength={5} value={cur} onChange={(e) => setCur(e.target.value)} />
        </Field>
      </div>
      <div className="-mt-2">
        <Segmented
          label={t("payments.form.amount")}
          value={split}
          onChange={setSplit}
          options={[
            { id: "each", label: t("payments.form.each") },
            { id: "total", label: t("payments.form.total") },
          ]}
        />
        <input type="hidden" name="split" value={split} />
        {preview && <p className="mt-1.5 text-xs text-muted">{preview}</p>}
      </div>

      <div>
        <span className={label}>{t("payments.form.due")}</span>
        <DateTimePicker name="dueAt" defaultTime="23:59" placeholder={t("payments.form.noDue")} />
        <p className="mt-1.5 text-xs text-faint">{t("payments.form.dueHint")}</p>
      </div>

      <Field label={t("payments.form.note")}>
        <textarea name="note" maxLength={1000} rows={2} className={textarea} placeholder={t("payments.form.notePlaceholder")} />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-bit" />
        <span>{t("payments.form.notify")}</span>
      </label>

      <button disabled={pending} className={btnPrimary}>
        {pending ? t("payments.form.creating") : t("payments.form.create")}
      </button>
    </form>
  );
}

/** Title, due date and note of an existing charge. */
export function ChargeEditForm({ chargeId, title, note, dueAt }: { chargeId: string; title: string; note: string; dueAt: string }) {
  const t = useT();
  const [, action, pending] = useToastAction(updateCharge.bind(null, chargeId), undefined);
  return (
    <form action={action} className="space-y-3">
      <Field label={t("payments.form.title")}>
        <Input name="title" required maxLength={80} defaultValue={title} />
      </Field>
      <div>
        <span className={label}>{t("payments.form.due")}</span>
        <DateTimePicker name="dueAt" defaultValue={dueAt} defaultTime="23:59" placeholder={t("payments.form.noDue")} />
      </div>
      <Field label={t("payments.form.note")}>
        <textarea name="note" maxLength={1000} rows={2} defaultValue={note} className={textarea} />
      </Field>
      <button disabled={pending} className={btnSecondary}>
        {t("common.save")}
      </button>
    </form>
  );
}

/** Puts more people on a charge. */
export function AddPeopleForm({ chargeId, people, amount }: { chargeId: string; people: PersonOption[]; amount: string }) {
  const t = useT();
  const [, action, pending] = useToastAction(addToCharge.bind(null, chargeId), undefined);
  if (!people.length) return <p className="text-sm text-muted">{t("payments.everyoneOn")}</p>;
  return (
    <form action={action} className="space-y-3">
      <ul className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-line p-2">
        {people.map((p) => (
          <li key={p.id}>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded px-2 text-sm hover:bg-raised">
              <input type="checkbox" name="people" value={p.id} className="h-4 w-4 accent-bit" />
              <span className="min-w-0 truncate">{p.label}</span>
              {!p.guest && <Verified />}
            </label>
          </li>
        ))}
      </ul>
      <Field label={t("payments.form.amountEach")}>
        <Input name="amount" inputMode="decimal" required defaultValue={amount} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="notify" defaultChecked className="mt-0.5 h-4 w-4 accent-bit" />
        <span>{t("payments.form.notify")}</span>
      </label>
      <button disabled={pending} className={btnSecondary}>
        {t("payments.add")}
      </button>
    </form>
  );
}

export type LineView = {
  id: string;
  name: string;
  full: string;
  guest: boolean;
  amountCents: number;
  status: ChargeItemStatus;
  /** "Paid in cash · Sat 14.11.2026, 18:00 · by Mike", formatted on the server. */
  detail: string;
};

const TONE: Record<ChargeItemStatus, "red" | "amber" | "emerald" | "zinc"> = { open: "red", reported: "amber", paid: "emerald", waived: "zinc" };
const VIAS: PaidVia[] = ["cash", "bank", "twint", "other"];

/** Everyone on a charge, with tick-off buttons. Select several to mark them paid in one go. */
export function ChargeLines({ chargeId, currency, lines }: { chargeId: string; currency: string; lines: LineView[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [via, setVia] = useState<PaidVia>("cash");
  const [editing, setEditing] = useState<string | null>(null);
  const owed = lines.filter((l) => l.status === "open" || l.status === "reported");

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      if (!(await act(fn))) return;
      setSelected(new Set());
      setEditing(null);
    });

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const markSelected = () => {
    const f = new FormData();
    for (const id of selected) f.append("line", id);
    f.set("via", via);
    run(() => markLinesPaid(chargeId, f));
  };

  return (
    <div className="space-y-3">
      {owed.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-raised p-2 text-sm">
          <label className="flex min-h-9 items-center gap-2 px-1">
            <input
              type="checkbox"
              className="h-4 w-4 accent-bit"
              checked={selected.size > 0 && selected.size === owed.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(owed.map((l) => l.id)) : new Set())}
            />
            {t("payments.selectOpen")}
          </label>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <select value={via} onChange={(e) => setVia(e.target.value as PaidVia)} aria-label={t("payments.via")} className={`${input} !min-h-9 !w-auto !py-1`}>
              {VIAS.map((v) => (
                <option key={v} value={v}>
                  {t(`payments.viaOption.${v}`)}
                </option>
              ))}
            </select>
            <button type="button" disabled={pending || selected.size === 0} onClick={markSelected} className={btnPrimary}>
              {selected.size ? t("payments.markPaid", { count: selected.size }) : t("payments.markSelected")}
            </button>
          </span>
        </div>
      )}
      <ul className="divide-y divide-line">
        {lines.map((l) => {
          const isOwed = l.status === "open" || l.status === "reported";
          return (
            <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
              {isOwed ? (
                <input
                  type="checkbox"
                  aria-label={l.full}
                  className="h-4 w-4 shrink-0 accent-bit"
                  checked={selected.has(l.id)}
                  onChange={() => toggle(l.id)}
                />
              ) : (
                <span className="w-4 shrink-0" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium">{l.name}</span>
                  {!l.guest && <Verified />}
                </span>
                <span className="block truncate text-xs text-muted">{[l.name !== l.full && l.full, l.detail].filter(Boolean).join(" · ")}</span>
              </span>
              {editing === l.id ? (
                <form
                  className="flex items-center gap-1"
                  action={(f) => run(() => setLineAmount(l.id, f))}
                >
                  <input name="amount" inputMode="decimal" defaultValue={(l.amountCents / 100).toFixed(2)} aria-label={t("payments.form.amount")} className={`${input} !min-h-9 !w-24 !py-1`} autoFocus />
                  <button disabled={pending} className={`${btnSecondary} text-xs`}>
                    {t("common.save")}
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setEditing(l.id)} title={t("payments.editAmount")} className="tabular-nums hover:text-bit">
                  {fmtAmount(l.amountCents, currency)}
                </button>
              )}
              <Pill tone={TONE[l.status]}>{t(`payments.status.${l.status}`)}</Pill>
              <span className="flex flex-wrap gap-1">
                {isOwed ? (
                  <>
                    <button type="button" disabled={pending} onClick={() => run(() => setLineStatus(l.id, "paid", via))} className={`${btnSecondary} text-xs`}>
                      {t("payments.paidVia", { via: t(`payments.viaOption.${via}`) })}
                    </button>
                    <button type="button" disabled={pending} onClick={() => run(() => setLineStatus(l.id, "waived"))} className={`${btnGhost} text-xs`}>
                      {t("payments.waive")}
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={pending} onClick={() => run(() => setLineStatus(l.id, "open"))} className={`${btnGhost} text-xs`}>
                    {t("payments.reopen")}
                  </button>
                )}
                <button type="button" disabled={pending} onClick={() => run(() => removeLine(l.id))} className={`${btnGhost} text-xs !text-danger`}>
                  {t("payments.remove")}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
