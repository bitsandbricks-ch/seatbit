"use client";
import { useState, useTransition } from "react";
import { addExpense, deleteExpense, deleteSettlement, recordSettlement, updateExpense } from "@/app/cost-actions";
import type { CostExpenseView, CostSettlementView, Transfer } from "@/lib/costs-math";
import { fmtAmount } from "@/lib/money";
import { Card, Pill, btnGhost, btnPrimary, btnSecondary, input, label } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { MultiSelect } from "./multi-select";
import type { AvatarData } from "@/lib/avatars";

function useRun() {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const run = (fn: () => Promise<{ error?: string } | void>, after?: () => void) =>
    start(async () => {
      if (await act(fn)) after?.();
    });
  return { pending, run, t };
}

export type CostPerson = { id: string; name: string; going: boolean; avatar?: AvatarData };

type Props = {
  lanId: string;
  meId: string;
  currency: string;
  expenses: CostExpenseView[];
  settlements: CostSettlementView[];
  /** userId -> balance in cents (positive: gets money back). */
  balances: Record<string, number>;
  transfers: Transfer[];
  totalCents: number;
  /** Everyone who can pay or share, me first. */
  people: CostPerson[];
  /** userId -> name, also for people no longer on the list. */
  names: Record<string, string>;
  /** Coming (or a lead): may log expenses. */
  canAdd: boolean;
  isLead: boolean;
  /** Pre-formatted "Sat 14.11.2026, 18:00" per expense and settlement id, so the browser can't shift it. */
  dates: Record<string, string>;
};

/** The Costs tab: who paid what for the group, everyone's balance, and who pays whom to settle up. */
export function SharedCosts(p: Props) {
  const t = useT();
  const money = (c: number) => fmtAmount(c, p.currency);
  const name = (id: string) => p.names[id] ?? t("costs.someone");
  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="max-w-2xl text-sm text-muted">{t("costs.intro")}</p>
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <SettleUp {...p} money={money} name={name} />
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {p.canAdd && <AddExpense {...p} />}
          <Card
            title={
              <>
                {t("costs.expenses")} <span className="text-faint">{p.expenses.length}</span>
              </>
            }
            actions={p.totalCents > 0 && <span className="text-sm tabular-nums text-muted">{t("costs.total", { amount: money(p.totalCents) })}</span>}
          >
            {p.expenses.length === 0 ? (
              <p className="text-sm text-muted">{t("costs.none")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {p.expenses.map((e) => (
                  <ExpenseRow key={e.id} e={e} {...p} money={money} name={name} />
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="min-w-0 space-y-4 sm:space-y-6 lg:col-start-2 lg:row-start-2">
          <Balances {...p} money={money} name={name} />
          <PaidBack {...p} money={money} name={name} />
        </div>
      </div>
    </div>
  );
}

/** The form starts folded once there are expenses, so the list and the balances stay in view on phones. */
function AddExpense(p: Props) {
  const t = useT();
  const [open, setOpen] = useState(p.expenses.length === 0);
  return open ? (
    <Card title={t("costs.addTitle")}>
      <ExpenseForm {...p} onDone={p.expenses.length ? () => setOpen(false) : undefined} />
    </Card>
  ) : (
    <button type="button" className={`${btnPrimary} w-full sm:w-auto`} onClick={() => setOpen(true)}>
      + {t("costs.add")}
    </button>
  );
}

type Fmt = { money: (c: number) => string; name: (id: string) => string };

function SettleUp({ meId, lanId, transfers, balances, isLead, money, name, expenses }: Props & Fmt) {
  const { pending, run, t } = useRun();
  const mine = balances[meId] ?? 0;
  const visible = isLead ? transfers : transfers.filter((x) => x.from === meId || x.to === meId);
  const others = transfers.length - visible.length;
  return (
    <Card title={t("costs.settleTitle")}>
      <div className="space-y-3 text-sm">
        {expenses.length > 0 && (
          <p className={mine < 0 ? "font-medium text-warn" : mine > 0 ? "font-medium text-bit" : "text-muted"}>
            {mine < 0 ? t("costs.youOwe", { amount: money(-mine) }) : mine > 0 ? t("costs.youGet", { amount: money(mine) }) : t("costs.youEven")}
          </p>
        )}
        {transfers.length === 0 ? (
          <p className="text-muted">{expenses.length ? t("costs.allSettled") : t("costs.nothingYet")}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {visible.map((x) => (
                <li key={`${x.from}-${x.to}`} className="flex flex-wrap items-center justify-between gap-2 rounded-bit border border-line px-3 py-2">
                  <span className="min-w-0">
                    <span className={x.from === meId ? "font-medium text-bit" : "text-fg"}>{x.from === meId ? t("costs.you") : name(x.from)}</span>
                    <span className="text-muted"> → </span>
                    <span className={x.to === meId ? "font-medium text-bit" : "text-fg"}>{x.to === meId ? t("costs.you") : name(x.to)}</span>
                    <span className="ml-2 tabular-nums text-fg">{money(x.amountCents)}</span>
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    className={`${btnSecondary} !min-h-8 text-xs`}
                    onClick={() => run(() => recordSettlement(lanId, x.from, x.to, (x.amountCents / 100).toFixed(2)))}
                  >
                    {x.to === meId ? t("costs.markReceived") : t("costs.markPaid")}
                  </button>
                </li>
              ))}
            </ul>
            {others > 0 && <p className="text-xs text-faint">{t("costs.otherTransfers", { count: others })}</p>}
          </>
        )}
      </div>
    </Card>
  );
}

function Balances({ balances, people, meId, money, name, expenses }: Props & Fmt) {
  const t = useT();
  if (!expenses.length) return null;
  const order = new Map(people.map((x, i) => [x.id, i]));
  const rows = Object.entries(balances)
    .filter(([, b]) => b !== 0)
    .sort(([a, x], [b, y]) => Number(b === meId) - Number(a === meId) || x - y || (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
  return (
    <Card title={t("costs.balances")}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("costs.allEven")}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {rows.map(([id, b]) => (
            <li key={id} className="flex items-center justify-between gap-2">
              <span className={`min-w-0 truncate ${id === meId ? "font-medium text-bit" : "text-fg"}`}>{name(id)}</span>
              <span className={`shrink-0 tabular-nums ${b < 0 ? "text-warn" : "text-bit"}`}>
                {b > 0 ? "+" : "−"}
                {money(Math.abs(b))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">{t("costs.balancesHint")}</p>
    </Card>
  );
}

function PaidBack({ settlements, meId, isLead, money, name, dates }: Props & Fmt) {
  const { pending, run, t } = useRun();
  if (!settlements.length) return null;
  return (
    <Card title={t("costs.paidBack")}>
      <ul className="space-y-2 text-sm">
        {settlements.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              {s.fromUserId === meId
                ? t("costs.paidLineMe", { to: name(s.toUserId) })
                : t("costs.paidLine", { from: name(s.fromUserId), to: s.toUserId === meId ? t("costs.youAcc") : name(s.toUserId) })}{" "}
              <span className="tabular-nums">{money(s.amountCents)}</span>
              <span className="block text-xs text-faint">
                {dates[s.id]}
                {s.createdBy && s.createdBy !== s.fromUserId && ` · ${t("costs.tickedBy", { name: s.createdBy === meId ? t("costs.youDat") : name(s.createdBy) })}`}
              </span>
            </span>
            {(isLead || [s.fromUserId, s.toUserId, s.createdBy].includes(meId)) && (
              <button type="button" disabled={pending} className={`${btnGhost} !min-h-8 shrink-0 text-xs`} onClick={() => run(() => deleteSettlement(s.id))}>
                {t("costs.undo")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ExpenseRow({ e, meId, isLead, money, name, dates, ...p }: Props & Fmt & { e: CostExpenseView }) {
  const { pending, run, t } = useRun();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const myShare = e.shares.find((s) => s.userId === meId);
  const canEdit = isLead || e.createdBy === meId || e.paidBy === meId;
  if (editing)
    return (
      <li className="py-3">
        <ExpenseForm {...p} meId={meId} isLead={isLead} dates={dates} edit={e} onDone={() => setEditing(false)} />
      </li>
    );
  return (
    <li className="py-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-fg">{e.title}</p>
          <p className="text-muted">
            {t("costs.paidBy", { name: e.paidBy === meId ? t("costs.youDat") : name(e.paidBy) })} ·{" "}
            {t("costs.splitBetween", { count: e.shares.length })}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular-nums text-fg">{money(e.amountCents)}</p>
          {myShare && e.paidBy !== meId && <p className="text-xs tabular-nums text-warn">{t("costs.yourShare", { amount: money(myShare.amountCents) })}</p>}
        </div>
      </div>
      <details className="group mt-1">
        <summary className="cursor-pointer list-none text-xs text-bit hover:underline">
          <span className="group-open:hidden">{t("costs.showDetails")}</span>
          <span className="hidden group-open:inline">{t("costs.hideDetails")}</span>
        </summary>
        <div className="mt-2 space-y-2">
          {e.note && <p className="whitespace-pre-wrap text-muted">{e.note}</p>}
          <ul className="flex flex-wrap gap-1">
            {e.shares.map((s) => (
              <li key={s.userId}>
                <Pill tone={s.userId === meId ? "emerald" : "zinc"}>
                  {s.userId === meId ? t("costs.you") : name(s.userId)} {money(s.amountCents)}
                </Pill>
              </li>
            ))}
          </ul>
          <p className="text-xs text-faint">
            {dates[e.id]}
            {e.createdBy && e.createdBy !== e.paidBy && ` · ${t("costs.loggedBy", { name: e.createdBy === meId ? t("costs.youDat") : name(e.createdBy) })}`}
          </p>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`${btnSecondary} !min-h-8 text-xs`} onClick={() => setEditing(true)}>
                {t("costs.edit")}
              </button>
              <button
                type="button"
                disabled={pending}
                className={`${btnGhost} !min-h-8 text-xs ${confirming ? "!text-danger" : ""}`}
                onClick={() => (confirming ? run(() => deleteExpense(e.id)) : setConfirming(true))}
              >
                {confirming ? t("costs.deleteSure") : t("costs.delete")}
              </button>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function ExpenseForm({
  lanId,
  meId,
  people,
  currency,
  edit,
  onDone,
}: Props & { edit?: CostExpenseView; onDone?: () => void }) {
  const { pending, run, t } = useRun();
  const going = people.filter((x) => x.going).map((x) => x.id);
  const start = edit ? edit.shares.map((s) => s.userId) : going;
  const [picked, setPicked] = useState<Set<string>>(new Set(start));
  const [key, setKey] = useState(0);
  // People on an expense who have since left the list still show, so editing doesn't drop them.
  const list = [...people, ...start.filter((id) => !people.some((x) => x.id === id)).map((id): CostPerson => ({ id, name: "?", going: false }))];
  return (
    <form
      key={key}
      className="space-y-3"
      action={(fd) =>
        run(
          () => (edit ? updateExpense(edit.id, fd) : addExpense(lanId, fd)),
          () => {
            if (!edit) {
              setPicked(new Set(going));
              setKey((k) => k + 1);
            }
            onDone?.();
          },
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="block">
          <span className={label}>{t("costs.what")}</span>
          <input name="title" required maxLength={80} defaultValue={edit?.title} placeholder={t("costs.whatPh")} className={input} />
        </label>
        <label className="block">
          <span className={label}>{t("costs.amount", { currency })}</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={edit ? (edit.amountCents / 100).toFixed(2) : undefined}
            placeholder="0.00"
            className={`${input} tabular-nums`}
          />
        </label>
      </div>
      <label className="block">
        <span className={label}>{t("costs.paidByLabel")}</span>
        <select name="paidBy" defaultValue={edit?.paidBy ?? meId} className={input}>
          {list.map((x) => (
            <option key={x.id} value={x.id}>
              {x.id === meId ? t("costs.meOption", { name: x.name }) : x.name}
            </option>
          ))}
        </select>
      </label>
      <div>
        <span className={label}>{t("costs.splitLabel")}</span>
        <MultiSelect
          name="people"
          label={t("costs.splitLabel")}
          value={picked}
          onChange={setPicked}
          options={list.map((x) => ({ id: x.id, label: x.id === meId ? t("costs.you") : x.name, avatar: x.avatar }))}
          presets={[
            { label: t("costs.everyoneComing"), ids: going },
            { label: t("costs.nobody"), ids: [] },
          ]}
        />
      </div>
      <label className="block">
        <span className={label}>{t("costs.note")}</span>
        <input name="note" maxLength={300} defaultValue={edit?.note} placeholder={t("costs.notePh")} className={input} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button disabled={pending || picked.size === 0} className={btnPrimary}>
          {edit ? t("costs.save") : t("costs.add")}
        </button>
        {onDone && (
          <button type="button" className={btnGhost} onClick={onDone}>
            {t("costs.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
