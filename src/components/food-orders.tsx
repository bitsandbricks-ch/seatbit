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
import type { FoodOrderStatus } from "@/db/schema";
import type { FoodOrderView } from "@/lib/food";
import { DateTimePicker } from "./date-time-picker";
import { Card, Pill, btnGhost, btnPrimary, btnSecondary, input, label } from "./ui";

const money = (cents: number) => (cents / 100).toFixed(2);

function useRun() {
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
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  return { pending, error, run };
}

export type FoodOrderCardView = FoodOrderView & {
  /** Plain text to copy for the call to the shop. */
  text: string;
  /** I started it or I'm an orga: close, mark ordered, tick payments. */
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
  /** Coming (or an orga): may start orders and add items. */
  canOrder: boolean;
  currency: string;
  /** Why the "DM everyone" box is off, e.g. for drafts. Null when it works. */
  announceHint: string | null;
}) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="max-w-2xl text-sm text-muted">
        Pizza run or a burger order at the LAN: whoever goes starts an order, everyone adds what they want, and they get
        a list to read out plus who owes what.
      </p>
      {orders.length === 0 && !canOrder && <p className="text-sm text-muted">No food orders yet.</p>}
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

const STATUS: Record<FoodOrderStatus, { text: string; tone: "emerald" | "amber" | "zinc" }> = {
  open: { text: "Open", tone: "emerald" },
  closed: { text: "Closed", tone: "amber" },
  ordered: { text: "Ordered", tone: "zinc" },
};

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
  const { pending, error, run } = useRun();
  const [copied, setCopied] = useState(false);
  // Deleting an order with items needs a second tap (no browser dialog).
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const status = o.status === "open" && !o.accepting ? { text: "Last call passed", tone: "amber" as const } : STATUS[o.status];
  const runner = o.createdBy ? names[o.createdBy] : null;
  const mine = o.people.find((p) => p.userId === meId);
  const owed = o.totalCents != null ? o.totalCents - o.paidCents : null;

  return (
    <Card
      title={o.title}
      actions={
        <span className="flex items-center gap-2">
          {o.status === "open" && o.accepting && o.closesTime && <Pill tone="amber">Last call {o.closesTime}</Pill>}
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
                  Menu <span aria-hidden>↗</span>
                </a>
              )}
              {runner && (
                <span className="block text-xs text-faint sm:inline sm:before:mx-2 sm:before:content-['·']">
                  Run by {runner}
                  {o.closesLabel && ` · last call ${o.closesLabel}`}
                </span>
              )}
            </p>
            {o.note && <p className="whitespace-pre-wrap">{o.note}</p>}
          </div>
        )}

        {o.people.length === 0 ? (
          <p className="text-muted">Nobody ordered yet.</p>
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
                          Paid
                        </label>
                      ) : (
                        p.paid && <Pill tone="emerald">paid</Pill>
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
                              {i.qty > 1 && " each"}
                            </span>
                          )}
                        </span>
                        {((i.userId === meId && o.accepting) || o.canRun) && (
                          <button
                            type="button"
                            disabled={pending}
                            aria-label={`Remove ${i.item}`}
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
            <select name="qty" aria-label="How many" className={input} defaultValue="1">
              {Array.from({ length: 10 }, (_, k) => (
                <option key={k + 1} value={k + 1}>
                  {k + 1}x
                </option>
              ))}
            </select>
            <input name="item" required maxLength={80} placeholder={mine ? "Something else?" : "e.g. Margherita"} aria-label="What" className={`${input} col-span-2 sm:col-span-1`} />
            <input name="note" maxLength={80} placeholder="Note" aria-label="Note" className={`${input} col-span-2 sm:col-span-1`} />
            <input name="price" inputMode="decimal" placeholder={`${currency} each`} aria-label={`Price each in ${currency}`} className={input} />
            <button disabled={pending} className={`${btnPrimary} col-span-3 sm:col-span-1`}>
              Add
            </button>
          </form>
        )}

        {o.summary.length > 0 && (
          <div className="space-y-2 rounded-bit bg-raised/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                To order <span className="text-faint">{o.itemCount}</span>
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
                {copied ? "Copied" : "Copy order"}
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
                Total{" "}
                <span className="font-semibold tabular-nums text-fg">
                  {currency} {money(o.totalCents)}
                </span>
                {owed != null && owed > 0 && o.paidCents > 0 && (
                  <span>
                    {" "}
                    · {currency} {money(owed)} still open
                  </span>
                )}
                {owed === 0 && <span className="text-bit"> · all paid</span>}
              </p>
            )}
          </div>
        )}

        {o.canRun && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            {o.status === "open" && (
              <button disabled={pending} className={btnSecondary} onClick={() => run(() => setFoodOrderStatus(o.id, "closed"))}>
                Close order
              </button>
            )}
            {o.status !== "ordered" && (
              <button disabled={pending} className={btnSecondary} onClick={() => run(() => setFoodOrderStatus(o.id, "ordered"))}>
                Mark as ordered
              </button>
            )}
            {(o.status !== "open" || !o.accepting) && (
              <button disabled={pending} className={btnGhost} onClick={() => run(() => setFoodOrderStatus(o.id, "open"))}>
                Reopen
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
              {confirming ? "Tap again to delete" : "Delete"}
            </button>
          </div>
        )}
        {error && <p className="text-danger">{error}</p>}
      </div>
    </Card>
  );
}

function NewOrder({ lanId, first, announceHint }: { lanId: string; first: boolean; announceHint: string | null }) {
  const { pending, error, run } = useRun();
  const [open, setOpen] = useState(first);
  const [key, setKey] = useState(0);
  if (!open)
    return (
      <div>
        <button className={btnSecondary} onClick={() => setOpen(true)}>
          + Start a food order
        </button>
      </div>
    );
  return (
    <Card title="Start a food order">
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
            What
          </label>
          <input id="food-title" name="title" required maxLength={60} placeholder="Pizza Saturday evening" className={input} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="food-shop">
              From
            </label>
            <input id="food-shop" name="shop" maxLength={60} placeholder="Pizzeria Roma" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="food-menu">
              Menu link
            </label>
            <input id="food-menu" name="menuUrl" type="url" placeholder="https://…" className={input} />
          </div>
        </div>
        <div>
          <span className={label}>Last call (optional)</span>
          <DateTimePicker name="closesAt" defaultTime="18:00" placeholder="No last call" />
        </div>
        <div>
          <label className={label} htmlFor="food-note">
            Note
          </label>
          <textarea
            id="food-note"
            name="note"
            rows={2}
            maxLength={300}
            placeholder="Pay me cash or TWINT when it arrives."
            className={input}
          />
        </div>
        <label className={`flex items-start gap-2 text-sm ${announceHint ? "text-faint" : "text-fg"}`}>
          <input type="checkbox" name="announce" defaultChecked={!announceHint} disabled={!!announceHint} className="mt-0.5 h-4 w-4 accent-bit" />
          <span>
            Send everyone coming a Discord DM
            <span className="block text-xs text-muted">{announceHint ?? "Only people who kept Seatbit DMs on get it. No email."}</span>
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={pending} className={btnPrimary}>
            Start order
          </button>
          {!first && (
            <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Card>
  );
}
