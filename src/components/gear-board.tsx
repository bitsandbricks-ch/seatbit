"use client";
import { useState, useTransition } from "react";
import {
  addGearExtra,
  copyGearNeeds,
  deleteGearNeed,
  deleteGearPledge,
  saveGearNeed,
  setGearPledge,
  setPacked,
} from "@/app/travel-gear-actions";
import { Card, Input, Pill, btnGhost, btnPrimary, btnSecondary } from "./ui";

export type GearNeedView = {
  id: string;
  name: string;
  qty: number;
  note: string;
  pledges: { userId: string; nick: string; qty: number }[];
};
export type GearExtraView = { id: string; userId: string; nick: string; name: string; qty: number };

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  return { pending, error, run };
}

export function SharedGear({
  lanId,
  needs,
  extras,
  meId,
  canPledge,
  isManager,
  suggestions,
  copyFrom,
}: {
  lanId: string;
  needs: GearNeedView[];
  extras: GearExtraView[];
  meId: string;
  canPledge: boolean;
  isManager: boolean;
  suggestions: { name: string; qty: number }[];
  copyFrom?: { id: string; name: string; count: number };
}) {
  const { pending, error, run } = useRun();
  const [editing, setEditing] = useState<string | null>(null);
  const [extra, setExtra] = useState({ name: "", qty: "1" });
  const missing = needs.filter((n) => n.pledges.reduce((s, p) => s + p.qty, 0) < n.qty).length;

  return (
    <div className="space-y-6">
      <Card
        title="Shared gear"
        actions={
          needs.length > 0 &&
          (missing ? <Pill tone="amber">{missing} still missing</Pill> : <Pill tone="emerald">All covered</Pill>)
        }
      >
        <p className="mb-4 text-sm text-muted">
          What the group needs at its table. Say how many you bring so nothing is missing and nobody carries three switches.
        </p>

        {needs.length === 0 && (
          <p className="mb-4 text-sm text-muted">
            {isManager ? "No shared gear on the list yet. Add what the group needs." : "The orgas haven't listed any shared gear yet."}
          </p>
        )}

        <ul className="space-y-2">
          {needs.map((n) => {
            const have = n.pledges.reduce((s, p) => s + p.qty, 0);
            const mine = n.pledges.find((p) => p.userId === meId)?.qty ?? 0;
            const ok = have >= n.qty;
            return (
              <li key={n.id} className="rounded-lg border border-line bg-ink/40 px-3 py-2.5 text-sm">
                {editing === n.id ? (
                  <NeedForm
                    initial={{ name: n.name, qty: String(n.qty), note: n.note }}
                    pending={pending}
                    submitLabel="Save"
                    onCancel={() => setEditing(null)}
                    onSave={(v) => run(() => saveGearNeed(lanId, { ...v, qty: Number(v.qty) }, n.id), () => setEditing(null))}
                  />
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-fg">{n.name}</p>
                        {n.note && <p className="text-muted">{n.note}</p>}
                      </div>
                      <span className={`shrink-0 font-mono text-sm ${ok ? "text-bit" : "text-warn"}`}>
                        {have} / {n.qty}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                      <div
                        className={`h-full rounded-full ${ok ? "bg-bit" : "bg-warn"}`}
                        style={{ width: `${Math.min(100, (have / n.qty) * 100)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <ul className="flex flex-wrap gap-1.5">
                        {n.pledges.map((p) => (
                          <li key={p.userId} className="rounded-full bg-raised px-2 py-0.5 text-xs">
                            <span className={p.userId === meId ? "text-bit" : ""}>{p.nick}</span>
                            {p.qty > 1 && <span className="text-muted"> ×{p.qty}</span>}
                          </li>
                        ))}
                      </ul>
                      <span className="flex items-center gap-1">
                        {isManager && (
                          <>
                            <button className={btnGhost} onClick={() => setEditing(n.id)}>
                              Edit
                            </button>
                            <button
                              className={`${btnGhost} text-danger`}
                              disabled={pending}
                              onClick={() => run(() => deleteGearNeed(n.id))}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {canPledge &&
                          (mine === 0 ? (
                            <button className={btnSecondary} disabled={pending} onClick={() => run(() => setGearPledge(n.id, 1))}>
                              I bring one
                            </button>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-bit/40 bg-bit-soft">
                              <button
                                aria-label="One less"
                                className="px-2.5 py-1 text-bit"
                                disabled={pending}
                                onClick={() => run(() => setGearPledge(n.id, mine - 1))}
                              >
                                −
                              </button>
                              <span className="min-w-14 text-center text-xs text-fg">I bring {mine}</span>
                              <button
                                aria-label="One more"
                                className="px-2.5 py-1 text-bit"
                                disabled={pending}
                                onClick={() => run(() => setGearPledge(n.id, mine + 1))}
                              >
                                +
                              </button>
                            </span>
                          ))}
                      </span>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>

        {isManager && (
          <div className="mt-4 space-y-3 border-t border-line pt-4">
            {needs.length === 0 && (copyFrom || suggestions.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {copyFrom && (
                  <button className={btnSecondary} disabled={pending} onClick={() => run(() => copyGearNeeds(lanId, copyFrom.id))}>
                    Copy {copyFrom.count} items from {copyFrom.name}
                  </button>
                )}
                {suggestions.map((s) => (
                  <button
                    key={s.name}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-fg/90 hover:border-bit hover:text-bit"
                    disabled={pending}
                    onClick={() => run(() => saveGearNeed(lanId, { name: s.name, qty: s.qty, note: "" }))}
                  >
                    + {s.name} ×{s.qty}
                  </button>
                ))}
              </div>
            )}
            <NeedForm
              initial={{ name: "", qty: "1", note: "" }}
              key={needs.length}
              pending={pending}
              submitLabel="Add to list"
              onSave={(v) => run(() => saveGearNeed(lanId, { ...v, qty: Number(v.qty) }))}
            />
          </div>
        )}
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>

      <Card title="Also bringing">
        <p className="mb-3 text-sm text-muted">Anything else for the group that isn&apos;t on the list, like a beamer or a coffee machine.</p>
        {extras.length > 0 && (
          <ul className="mb-3 space-y-1">
            {extras.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 rounded bg-raised/60 px-3 py-1.5 text-sm">
                <span className="min-w-0 truncate">
                  {x.name}
                  {x.qty > 1 && <span className="text-muted"> ×{x.qty}</span>}
                  <span className={`ml-2 text-xs ${x.userId === meId ? "text-bit" : "text-faint"}`}>{x.nick}</span>
                </span>
                {(x.userId === meId || isManager) && (
                  <button
                    aria-label={`Remove ${x.name}`}
                    className="text-muted hover:text-danger"
                    disabled={pending}
                    onClick={() => run(() => deleteGearPledge(x.id))}
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canPledge ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addGearExtra(lanId, extra.name, Number(extra.qty)), () => setExtra({ name: "", qty: "1" }));
            }}
          >
            <Input
              required
              maxLength={40}
              placeholder="What do you bring?"
              value={extra.name}
              onChange={(e) => setExtra({ ...extra, name: e.target.value })}
            />
            <span className="w-20 shrink-0">
              <Input
                type="number"
                min={1}
                max={99}
                aria-label="How many"
                value={extra.qty}
                onChange={(e) => setExtra({ ...extra, qty: e.target.value })}
              />
            </span>
            <button className={btnPrimary} disabled={pending}>
              Add
            </button>
          </form>
        ) : (
          extras.length === 0 && <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}

function NeedForm({
  initial,
  pending,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: { name: string; qty: string; note: string };
  pending: boolean;
  submitLabel: string;
  onSave: (v: { name: string; qty: string; note: string }) => void;
  onCancel?: () => void;
}) {
  const [v, set] = useState(initial);
  return (
    <form
      className="grid grid-cols-[1fr_4.5rem] gap-2 sm:grid-cols-[1fr_5rem_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <Input required maxLength={40} placeholder="Item, e.g. Network switch" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} />
      <Input
        type="number"
        min={1}
        max={99}
        aria-label="How many are needed"
        value={v.qty}
        onChange={(e) => set({ ...v, qty: e.target.value })}
      />
      <Input maxLength={100} placeholder="Note (optional)" value={v.note} onChange={(e) => set({ ...v, note: e.target.value })} className="col-span-2 sm:col-span-1" />
      <span className="col-span-2 flex gap-2 sm:col-span-1">
        <button className={btnPrimary} disabled={pending}>
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className={btnGhost} onClick={onCancel}>
            Cancel
          </button>
        )}
      </span>
    </form>
  );
}

export function PackingList({
  lanId,
  items,
  packed,
}: {
  lanId: string;
  items: readonly { id: string; label: string }[];
  packed: string[];
}) {
  const { pending, error, run } = useRun();
  const [done, setDone] = useState(new Set(packed));
  return (
    <Card title="Your packing list" actions={<span className="text-sm text-muted">{done.size} / {items.length}</span>}>
      <p className="mb-3 text-sm text-muted">Only you see this. Tick things off as you pack.</p>
      <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        {items.map((it) => {
          const on = done.has(it.id);
          return (
            <li key={it.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-raised">
                <input
                  type="checkbox"
                  className="size-4 accent-bit"
                  checked={on}
                  disabled={pending}
                  onChange={(e) => {
                    const next = new Set(done);
                    if (e.target.checked) next.add(it.id);
                    else next.delete(it.id);
                    setDone(next);
                    run(() => setPacked(lanId, it.id, e.target.checked));
                  }}
                />
                <span className={on ? "text-faint line-through" : "text-fg"}>{it.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
