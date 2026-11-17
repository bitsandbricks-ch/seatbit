"use client";
import { useOptimistic, useState, useTransition } from "react";
import { addPackingItem, deletePackingItem, setPacked, setPackingItemPacked } from "@/app/travel-gear-actions";
import { addPastPackingItems } from "@/app/packing-history-actions";
import { Card, Input, btnPrimary } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import type { MessageKey } from "@/i18n/translate";

type Row = { key: string; label: string; packed: boolean; ownId?: string };

/** A member's private packing list: the standard items plus items they add themselves. */
export function PackingList({
  lanId,
  items,
  packed,
  own,
  past = [],
}: {
  lanId: string;
  items: readonly { id: string; label: string }[];
  packed: string[];
  own: { id: string; label: string; packed: boolean }[];
  /** Own items from earlier LANs that aren't on this list yet. */
  past?: string[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const [draft, setDraft] = useState("");
  // Ticks show at once (slow LAN wifi) and fall back if saving fails.
  const [ticks, setTick] = useOptimistic<Record<string, boolean>, [string, boolean]>({}, (s, [k, on]) => ({ ...s, [k]: on }));

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      if (!(await act(fn))) return;
      after?.();
    });

  // Standard items are translated; an id without a translation keeps its English label.
  const itemLabel = (it: { id: string; label: string }) => {
    const key = `packing.items.${it.id}` as MessageKey;
    const s = t(key);
    return s === key ? it.label : s;
  };
  const rows: Row[] = [
    ...items.map((it) => ({ key: it.id, label: itemLabel(it), packed: packed.includes(it.id) })),
    ...own.map((it) => ({ key: `own:${it.id}`, label: it.label, packed: it.packed, ownId: it.id })),
  ].map((r) => ({ ...r, packed: ticks[r.key] ?? r.packed }));
  const done = rows.filter((r) => r.packed).length;

  return (
    <Card title={t("packing.title")} actions={<span className="text-sm text-muted">{done} / {rows.length}</span>}>
      <p className="mb-3 text-sm text-muted">{t("packing.intro")}</p>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-1 rounded-md hover:bg-raised">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-bit"
                checked={r.packed}
                onChange={(e) => {
                  const on = e.target.checked;
                  run(() => {
                    setTick([r.key, on]);
                    return r.ownId ? setPackingItemPacked(r.ownId, on) : setPacked(lanId, r.key, on);
                  });
                }}
              />
              <span className={`truncate ${r.packed ? "text-faint line-through" : "text-fg"}`}>{r.label}</span>
            </label>
            {r.ownId && (
              <button
                aria-label={t("packing.remove", { item: r.label })}
                disabled={pending}
                onClick={() => run(() => deletePackingItem(r.ownId!))}
                className="px-3 py-1.5 text-faint hover:text-danger"
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2 sm:max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addPackingItem(lanId, draft), () => setDraft(""));
        }}
      >
        <Input
          required
          maxLength={40}
          placeholder={t("packing.placeholder")}
          aria-label={t("packing.newItem")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className={btnPrimary} disabled={pending}>
          {t("packing.add")}
        </button>
      </form>
      {past.length > 0 && (
        <section aria-label={t("packing.pastTitle")} className="mt-4 border-t border-line pt-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted">{t("packing.pastTitle")}</p>
            {past.length > 1 && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => addPastPackingItems(lanId))}
                className="text-xs font-medium text-bit hover:underline"
              >
                {t("packing.pastAll")}
              </button>
            )}
          </div>
          <ul className="flex flex-wrap gap-2">
            {past.map((label) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => addPackingItem(lanId, label))}
                  aria-label={t("packing.pastAdd", { item: label })}
                  className="min-h-9 rounded-md border border-dashed border-line px-3 text-sm text-muted transition hover:border-bit hover:text-fg"
                >
                  + {label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}
