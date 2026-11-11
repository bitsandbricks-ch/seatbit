"use client";
import { useState, useTransition } from "react";
import { addPackingItem, deletePackingItem, setPacked, setPackingItemPacked } from "@/app/travel-gear-actions";
import { Card, Input, btnPrimary } from "./ui";

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
        setError(e instanceof Error ? e.message : "Failed");
      }
    });

  const rows: Row[] = [
    ...items.map((it) => ({ key: it.id, label: it.label, packed: packed.includes(it.id) })),
    ...own.map((it) => ({ key: `own:${it.id}`, label: it.label, packed: it.packed, ownId: it.id })),
  ].map((r) => ({ ...r, packed: ticks[r.key] ?? r.packed }));
  const done = rows.filter((r) => r.packed).length;

  return (
    <Card title="Your packing list" actions={<span className="text-sm text-muted">{done} / {rows.length}</span>}>
      <p className="mb-3 text-sm text-muted">Only you see this. Add your own things and tick them off as you pack.</p>
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
                aria-label={`Remove ${r.label}`}
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
          placeholder="Add an item, e.g. controller"
          aria-label="New item"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className={btnPrimary} disabled={pending}>
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  );
}
