"use client";
import { useRef, useState, useTransition } from "react";
import {
  addFoodItem,
  createFoodOrder,
  deleteFoodOrder,
  removeFoodItem,
  setFoodOrderStatus,
  setFoodPaid,
} from "@/app/food-actions";
import type { FoodOrderView } from "@/lib/food";
import { DateTimePicker } from "./date-time-picker";
import { Card, Pill, btnGhost, btnPrimary, btnSecondary, input, label } from "./ui";
import { useT } from "@/i18n/client";

const money = (cents: number) => (cents / 100).toFixed(2);

function useRun() {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string } | void>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        const r = await fn();
        if (r && r.error) setError(r.error);
        else after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("eventUi.failed"));
      }
    });
  return { pending, error, run, t };
}

export type FoodOrderCardView = FoodOrderView & {
  /** Plain text to copy for the call to the shop. */
  text: string;
  /** I started it or I'm a lead: close, mark ordered, tick payments. */
  canRun: boolean;
  /** Open and before its last call. */
  accepting: boolean;
  /** Last call formatted on the server ("19:00" and "Sat 28.11.2026, 19:00"), so the browser's time zone can't shift it. */
  closesTime: string | null;
  closesLabel: string | null;
};

/** The Food tab: food runs at the LAN, everyone adds their order, one person orders and collects the money. */
export function FoodOrders({
  lanId,
  orders,
  names,
  meId,
  canOrder,
  currency,
  announceHint,
}: {
  lanId: string;
  orders: FoodOrderCardView[];
  /** userId -> full display name */
  names: Record<string, string>;
  meId: string;
  /** Coming (or a lead): may start orders and add items. */
  canOrder: boolean;
  currency: string;
  /** Why the "DM everyone" box is off, e.g. for drafts. Null when it works. */
  announceHint: string | null;
}) {
  const t = useT();
  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="max-w-2xl text-sm text-muted">{t("food.intro")}</p>
      {orders.length === 0 && !canOrder && <p className="text-sm text-muted">{t("food.none")}</p>}
      <div className="grid items-start gap-4 sm:gap-6 xl:grid-cols-2">
        {orders.map((o) => (
          <OrderCard key={o.id} order={o} names={names} meId={meId} canOrder={canOrder} currency={currency} />
        ))}
        {canOrder && (
          <NewOrder lanId={lanId} first={orders.length === 0} announceHint={announceHint} />
        )}
      </div>
    </div>
  );
}

function OrderCard({
  order: o,
  names,
  meId,
  canOrder,
  currency,
}: {
  order: FoodOrderCardView;
  names: Record<string, string>;
  meId: string;
  canOrder: boolean;
  currency: string;
}) {
  const { pending, error, run, t } = useRun();
  const [copied, setCopied] = useState(false);
  // Deleting an order with items needs a second tap (no browser dialog).
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const tones = { open: "emerald", closed: "amber", ordered: "zinc" } as const;
  const status =
    o.status === "open" && !o.accepting
      ? { text: t("food.lastCallPassed"), tone: "amber" as const }
      : { text: t(`food.status.${o.status}`), tone: tones[o.status] };
  const runner = o.createdBy ? names[o.createdBy] : null;
  const mine = o.people.find((p) => p.userId === meId);
  const owed = o.totalCents != null ? o.totalCents - o.paidCents : null;

  return (
    <Card
      title={o.title}
      actions={
        <span className="flex items-center gap-2">
          {o.status === "open" && o.accepting && o.closesTime && <Pill tone="amber">{t("food.lastCallAt", { time: o.closesTime })}</Pill>}
          <Pill tone={status.tone}>{status.text}</Pill>
        </span>
      }
    >
      <div className="space-y-4 text-sm">
        {(o.shop || o.menuUrl || runner || o.note) && (
          <div className="space-y-1 text-muted">
            <p>
              {o.shop && <span className="text-fg">{o.shop}</span>}
              {o.menuUrl && (
                <a href={o.menuUrl} target="_blank" rel="noreferrer" className={`${o.shop ? "ml-2 " : ""}text-bit hover:underline`}>
                  {t("food.menu")} <span aria-hidden>↗</span>
                </a>
              )}
              {runner && (
                <span className="block text-xs text-faint sm:inline sm:before:mx-2 sm:before:content-['·']">
                  {t("food.runBy", { name: runner })}
                  {o.closesLabel && ` · ${t("food.lastCall", { date: o.closesLabel })}`}
                </span>
              )}
            </p>
            {o.note && <p className="whitespace-pre-wrap">{o.note}</p>}
          </div>
        )}

        {o.people.length === 0 ? (
          <p className="text-muted">{t("food.nobody")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-bit border border-line">
            {[...o.people]
              .sort((a, b) => Number(b.userId === meId) - Number(a.userId === meId) || (names[a.userId] ?? "").localeCompare(names[b.userId] ?? ""))
              .map((p) => (
                <li key={p.userId} className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 truncate font-medium ${p.userId === meId ? "text-bit" : "text-fg"}`}>
                      {names[p.userId] ?? "?"}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.totalCents != null && (
                        <span className="tabular-nums text-muted">
                          {currency} {money(p.totalCents)}
                        </span>
                      )}
                      {o.canRun ? (
                        <label className="flex min-h-8 items-center gap-1.5 rounded-md border border-line px-2 text-xs">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-bit"
                            checked={p.paid}
                            disabled={pending}
                            onChange={(e) => run(() => setFoodPaid(o.id, p.userId, e.target.checked))}
                          />
                          {t("food.paid")}
                        </label>
                      ) : (
                        p.paid && <Pill tone="emerald">{t("food.paidPill")}</Pill>
                      )}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {p.items.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 text-fg/90">
                        <span className="min-w-0">
                          <span className="tabular-nums text-muted">{i.qty}x</span> {i.item}
                          {i.note && <span className="text-muted"> · {i.note}</span>}
                          {i.priceCents != null && (
                            <span className="ml-1 text-xs tabular-nums text-faint">
                              {money(i.priceCents)}
                              {i.qty > 1 && ` ${t("food.each")}`}
                            </span>
                          )}
                        </span>
                        {((i.userId === meId && o.accepting) || o.canRun) && (
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={t("food.remove", { item: i.item })}
                            className={`${btnGhost} !min-h-8 shrink-0 !px-2`}
                            onClick={() => run(() => removeFoodItem(i.id))}
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ul>
        )}

        {canOrder && (o.accepting || (o.canRun && o.status !== "ordered")) && (
          <form
            ref={form}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] gap-2 sm:grid-cols-[4.5rem_minmax(0,2fr)_minmax(0,1.3fr)_6rem_auto]"
            action={(fd) => run(() => addFoodItem(o.id, fd), () => form.current?.reset())}
          >
            <select name="qty" aria-label={t("food.howMany")} className={input} defaultValue="1">
              {Array.from({ length: 10 }, (_, k) => (
                <option key={k + 1} value={k + 1}>
                  {k + 1}x
                </option>
              ))}
            </select>
            <input name="item" required maxLength={80} placeholder={mine ? t("food.somethingElse") : t("food.itemPh")} aria-label={t("food.what")} className={`${input} col-span-2 sm:col-span-1`} />
            <input name="note" maxLength={80} placeholder={t("food.note")} aria-label={t("food.note")} className={`${input} col-span-2 sm:col-span-1`} />
            <input name="price" inputMode="decimal" placeholder={t("food.priceEach", { currency })} aria-label={t("food.priceAria", { currency })} className={input} />
            <button disabled={pending} className={`${btnPrimary} col-span-3 sm:col-span-1`}>
              {t("food.add")}
            </button>
          </form>
        )}

        {o.summary.length > 0 && (
          <div className="space-y-2 rounded-bit bg-raised/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                {t("food.toOrder")} <span className="text-faint">{o.itemCount}</span>
              </h3>
              <button
                type="button"
                className={`${btnGhost} !min-h-8 text-xs`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(o.text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  } catch {}
                }}
              >
                {copied ? t("food.copied") : t("food.copy")}
              </button>
            </div>
            <ul className="columns-1 gap-4 sm:columns-2">
              {o.summary.map((s) => (
                <li key={s.item} className="break-inside-avoid">
                  <span className="font-semibold tabular-nums text-fg">{s.qty}x</span> {s.item}
                </li>
              ))}
            </ul>
            {o.totalCents != null && (
              <p className="border-t border-line pt-2 text-muted">
                {t("food.total")}{" "}
                <span className="font-semibold tabular-nums text-fg">
                  {currency} {money(o.totalCents)}
                </span>
                {owed != null && owed > 0 && o.paidCents > 0 && (
                  <span>
                    {" "}
                    · {t("food.stillOpen", { amount: `${currency} ${money(owed)}` })}
                  </span>
                )}
                {owed === 0 && <span className="text-bit"> · {t("food.allPaid")}</span>}
              </p>
            )}
          </div>
        )}

        {o.canRun && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {o.status === "open" && (
              <button disabled={pending} className={btnSecondary} onClick={() => run(() => setFoodOrderStatus(o.id, "closed"))}>
                {t("food.close")}
              </button>
            )}
            {o.status !== "ordered" && (
              <button disabled={pending} className={btnSecondary} onClick={() => run(() => setFoodOrderStatus(o.id, "ordered"))}>
                {t("food.markOrdered")}
              </button>
            )}
            {(o.status !== "open" || !o.accepting) && (
              <button disabled={pending} className={btnGhost} onClick={() => run(() => setFoodOrderStatus(o.id, "open"))}>
                {t("food.reopen")}
              </button>
            )}
            <button
              disabled={pending}
              className={`${btnGhost} ml-auto text-danger`}
              onClick={() => {
                if (o.people.length === 0 || confirming) run(() => deleteFoodOrder(o.id));
                else {
                  setConfirming(true);
                  setTimeout(() => setConfirming(false), 4000);
                }
              }}
            >
              {confirming ? t("food.tapAgain") : t("food.delete")}
            </button>
          </div>
        )}
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Card>
  );
}

function NewOrder({ lanId, first, announceHint }: { lanId: string; first: boolean; announceHint: string | null }) {
  const { pending, error, run, t } = useRun();
  const [open, setOpen] = useState(first);
  const [key, setKey] = useState(0);
  if (!open)
    return (
      <div>
        <button className={btnSecondary} onClick={() => setOpen(true)}>
          {t("food.start")}
        </button>
      </div>
    );
  return (
    <Card title={t("food.startTitle")}>
      <form
        key={key}
        className="space-y-3"
        action={(fd) =>
          run(
            () => createFoodOrder(lanId, fd),
            () => {
              setKey((k) => k + 1);
              setOpen(false);
            },
          )
        }
      >
        <div>
          <label className={label} htmlFor="food-title">
            {t("food.what")}
          </label>
          <input id="food-title" name="title" required maxLength={60} placeholder={t("food.titlePh")} className={input} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="food-shop">
              {t("food.from")}
            </label>
            <input id="food-shop" name="shop" maxLength={60} placeholder={t("food.shopPh")} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="food-menu">
              {t("food.menuLink")}
            </label>
            <input id="food-menu" name="menuUrl" type="url" placeholder="https://…" className={input} />
          </div>
        </div>
        <div>
          <span className={label}>{t("food.lastCallOptional")}</span>
          <DateTimePicker name="closesAt" defaultTime="18:00" placeholder={t("food.noLastCall")} />
        </div>
        <div>
          <label className={label} htmlFor="food-note">
            {t("food.note")}
          </label>
          <textarea
            id="food-note"
            name="note"
            rows={2}
            maxLength={300}
            placeholder={t("food.notePh")}
            className={input}
          />
        </div>
        <label className={`flex items-start gap-2 text-sm ${announceHint ? "text-faint" : "text-fg"}`}>
          <input type="checkbox" name="announce" defaultChecked={!announceHint} disabled={!!announceHint} className="mt-0.5 h-4 w-4 accent-bit" />
          <span>
            {t("food.dmAll")}
            <span className="block text-xs text-muted">{announceHint ?? t("food.dmHint")}</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} className={btnPrimary}>
            {t("food.startOrder")}
          </button>
          {!first && (
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
