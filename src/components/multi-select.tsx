"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AvatarData } from "@/lib/avatars";
import { Avatar } from "./avatar";
import { btnGhost } from "./ui";
import { useT } from "@/i18n/client";

export type MultiSelectOption = {
  id: string;
  label: string;
  avatar?: AvatarData;
  /** Small text after the name, e.g. "not coming". */
  hint?: string;
};

/**
 * A dropdown to pick several people: the button shows who is picked (stacked
 * avatars and names), the list opens below with a search and checkboxes.
 * Each picked id is posted as a hidden input named `name`, so it works inside
 * a plain form action.
 */
export function MultiSelect({
  name,
  options,
  value,
  onChange,
  presets,
  placeholder,
  label,
}: {
  name: string;
  options: MultiSelectOption[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  /** Quick picks shown at the top of the list, e.g. "Everyone coming". */
  presets?: { label: string; ids: string[] }[];
  placeholder?: string;
  /** Accessible name of the button and the list. */
  label: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const picked = options.filter((o) => value.has(o.id));

  useEffect(() => {
    if (!open) return;
    document.getElementById(listId)?.parentElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // A phone keyboard would cover half the list, so only focus the search with a mouse.
    if (window.matchMedia("(pointer: fine)").matches) search.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, listId]);

  const toggle = (id: string) => {
    const n = new Set(value);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    onChange(n);
  };
  const sameAs = (ids: string[]) => ids.length === value.size && ids.every((id) => value.has(id));

  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, Math.min(shown.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(n);
      document.getElementById(`${listId}-${n}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      // Enter picks the highlighted person instead of sending the form.
      e.preventDefault();
      if (shown[active]) toggle(shown[active].id);
    }
  };

  let summary: ReactNode = <span className="text-faint">{placeholder ?? t("multiSelect.none")}</span>;
  if (picked.length > 0) {
    const names = picked.slice(0, 3).map((o) => o.label);
    summary = (
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 -space-x-1.5">
          {picked.slice(0, 4).map((o) => (
            <Avatar key={o.id} data={o.avatar} size={22} ring={false} />
          ))}
        </span>
        <span className="truncate">
          {picked.length > 3 ? t("multiSelect.andMore", { names: names.join(", "), count: picked.length - 3 }) : names.join(", ")}
        </span>
      </span>
    );
  }

  return (
    <div ref={box} className="relative">
      {[...value].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-md border bg-raised px-3 py-1.5 text-left text-base text-fg transition sm:min-h-10 sm:text-sm ${
          open ? "border-bit ring-2 ring-bit/25" : "border-line hover:border-muted/40"
        }`}
      >
        {summary}
        <span className="flex shrink-0 items-center gap-2 text-muted">
          <span className="rounded-full bg-line px-2 py-0.5 text-xs tabular-nums text-fg">{picked.length}</span>
          <span aria-hidden className={`text-xs transition ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-0 z-40 mt-2 rounded-card border border-line bg-surface shadow-2xl shadow-black/60 light:shadow-black/15">
          <div className="border-b border-line p-2">
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={t("multiSelect.search")}
              aria-label={t("multiSelect.search")}
              aria-controls={listId}
              aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
              className="min-h-10 w-full rounded-md border border-line bg-raised px-3 text-base text-fg placeholder:text-faint focus:border-bit focus:outline-none sm:text-sm"
            />
            {presets && presets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={sameAs(p.ids)}
                    onClick={() => onChange(new Set(p.ids))}
                    className={`rounded-bit border px-2 py-1 text-xs ${sameAs(p.ids) ? "border-bit bg-bit-soft text-fg" : "border-line text-muted hover:text-fg"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul id={listId} role="listbox" aria-multiselectable aria-label={label} className="max-h-72 overflow-y-auto overscroll-contain p-1">
            {shown.map((o, i) => {
              const on = value.has(o.id);
              return (
                <li
                  key={o.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.id)}
                  onPointerMove={() => setActive(i)}
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm sm:min-h-10 ${i === active ? "bg-raised" : ""}`}
                >
                  <span
                    aria-hidden
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-sm border text-[10px] leading-none ${
                      on ? "border-bit bg-bit text-on-bit" : "border-muted/50"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <Avatar data={o.avatar} size={24} />
                  <span className={`min-w-0 flex-1 truncate ${on ? "text-fg" : "text-muted"}`}>{o.label}</span>
                  {o.hint && <span className="shrink-0 text-xs text-faint">{o.hint}</span>}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-2 py-3 text-sm text-faint">{t("multiSelect.noMatch")}</li>}
          </ul>
          <div className="flex justify-end border-t border-line p-2">
            <button type="button" onClick={() => setOpen(false)} className={`${btnGhost} !min-h-9 !px-3 text-sm`}>
              {t("multiSelect.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
