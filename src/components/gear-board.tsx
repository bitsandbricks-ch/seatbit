"use client";
import { useState, useTransition } from "react";
import { addPackingItem, deletePackingItem, setPacked, setPackingItemPacked } from "@/app/travel-gear-actions";
import { Card, Input, btnPrimary } from "./ui";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n/translate";

type Row = { key: string; label: string; packed: boolean; ownId?: string };

/** A member's private packing list: the standard items plus items they add themselves. */
export function PackingList({
  lanId,
  items,
  packed,
  own,
}: {
  lanId: string;
  items: readonly { id: string; label: string }[];
  packed: string[];
  own: { id: string; label: string; packed: boolean }[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Optimistic ticks, so the checkbox doesn't wait for the server.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("eventUi.failed"));
      }
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
      <ul className="grid gap-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-1 rounded-md hover:bg-raised">
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-2 py-1.5 text-sm">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-bit"
                checked={r.packed}
                onChange={(e) => {
                  const on = e.target.checked;
                  setTicks((t) => ({ ...t, [r.key]: on }));
                  run(() => (r.ownId ? setPackingItemPacked(r.ownId, on) : setPacked(lanId, r.key, on)));
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
        className="mt-3 flex gap-2"
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
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
