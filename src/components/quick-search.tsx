"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { quickSearch, type SearchHit } from "@/app/search-actions";
import { useT } from "@/i18n/client";
import { Avatar } from "./avatar";

// Quick search (Ctrl+K / ⌘K, or the search button in the header): jump to an event, a person or
// a clan without clicking through lists. Results come from quickSearch(), which only searches what
// the person can already see.

const icon = (
  <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const noop = () => () => {};

export function QuickSearch() {
  const t = useT();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, start] = useTransition();
  const mac = useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      field.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // A short pause after typing, so not every key is a request.
  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const timer = setTimeout(() => {
      start(async () => {
        try {
          const r = await quickSearch(query);
          setHits(r);
          setActive(0);
        } catch {
          setHits([]);
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [q]);

  const close = () => {
    setOpen(false);
    setQ("");
    setHits([]);
  };
  const go = (h: SearchHit) => {
    close();
    router.push(h.href);
  };

  const shown = q.trim() ? hits : [];
  const groups = (["event", "person", "clan"] as const)
    .map((kind) => ({ kind, items: shown.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);
  const label = { event: t("search.events"), person: t("search.people"), clan: t("search.clans") };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("search.label")}
        title={`${t("search.open")} (${mac ? "⌘" : "Ctrl+"}K)`}
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-surface px-2.5 text-sm text-muted transition hover:border-bit/60 hover:text-fg"
      >
        {icon}
        <span className="hidden lg:inline">{t("search.open")}</span>
        <kbd className="hidden rounded border border-line px-1 font-sans text-[11px] text-faint lg:inline">{mac ? "⌘K" : "Ctrl K" /* i18n-ignore */}</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label={t("search.label")}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-0 mx-auto mt-0 h-dvh max-h-none w-full max-w-none border-0 bg-bg p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-[2px] sm:mt-[12vh] sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-card sm:border sm:border-line sm:shadow-2xl"
      >
        <div className="flex h-full flex-col sm:max-h-[70vh]">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <span className="text-muted">{icon}</span>
            <input
              ref={field}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(flat.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter" && flat[active]) {
                  e.preventDefault();
                  go(flat[active]);
                }
              }}
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
              aria-controls="quick-search-results"
              aria-activedescendant={flat[active] ? `qs-${flat[active].kind}-${flat[active].id}` : undefined}
              role="combobox"
              aria-expanded={flat.length > 0}
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint"
              type="text"
              enterKeyHint="search"
              autoComplete="off"
            />
            <button type="button" onClick={close} className="rounded-md px-2 py-1 text-sm text-muted hover:bg-raised hover:text-fg sm:hidden">
              {t("dialog.cancel")}
            </button>
          </div>
          <div id="quick-search-results" role="listbox" aria-label={t("search.label")} className="min-h-0 flex-1 overflow-y-auto p-2 sm:flex-none">
            {!q.trim() ? (
              <p className="px-2 py-6 text-center text-sm text-muted">{t("search.hint")}</p>
            ) : !flat.length && !loading ? (
              <p className="px-2 py-6 text-center text-sm text-muted">{t("search.none", { q: q.trim() })}</p>
            ) : (
              groups.map((g) => (
                <div key={g.kind} role="group" aria-label={label[g.kind]} className="mb-2">
                  <p className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">{label[g.kind]}</p>
                  {g.items.map((h) => {
                    const i = flat.indexOf(h);
                    return (
                      <div
                        key={`${h.kind}-${h.id}`}
                        id={`qs-${h.kind}-${h.id}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(h)}
                        className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 ${i === active ? "bg-raised" : ""}`}
                      >
                        {h.kind === "person" ? (
                          <Avatar data={h.avatar} size={28} ring={false} />
                        ) : (
                          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-xs text-muted">
                            {h.kind === "event" ? "📅" : "👥"}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{h.title}</span>
                          <span className="block truncate text-xs text-muted">{h.sub}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
          <p className="hidden border-t border-line px-3 py-2 text-xs text-faint sm:block">{t("search.keys")}</p>
        </div>
      </dialog>
    </>
  );
}
