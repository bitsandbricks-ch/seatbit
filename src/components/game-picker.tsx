"use client";
import { useEffect, useId, useState, useTransition } from "react";
import { findGames, type GameSuggestion } from "@/app/game-catalog-actions";
import { useT } from "@/i18n/client";
import { input } from "./ui";

export type Picked = { kind: "catalog"; id: string } | { kind: "steam"; appId: number } | null;

/**
 * The game name field of "Add game": suggests catalog games and Steam games while typing.
 * Picking one sends its catalog id or Steam app id along, so the details come from there.
 */
export function GamePicker({ onPick, resetKey }: { onPick: (p: Picked) => void; resetKey: number }) {
  const t = useT();
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GameSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState<Picked>(null);
  const [, start] = useTransition();

  // The form was sent: start over.
  const [seen, setSeen] = useState(resetKey);
  if (seen !== resetKey) {
    setSeen(resetKey);
    setQ("");
    setHits([]);
    setPicked(null);
  }

  // A short pause after typing, so not every key is a request.
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2 || picked) return;
    const timer = setTimeout(() => {
      start(async () => {
        try {
          setHits(await findGames(query));
          setActive(0);
        } catch {
          setHits([]);
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, picked]);

  const pick = (h: GameSuggestion) => {
    const p: Picked = h.kind === "catalog" ? { kind: "catalog", id: h.id } : { kind: "steam", appId: h.appId };
    setQ(h.name);
    setPicked(p);
    setOpen(false);
    onPick(p);
  };
  const shown = open && q.trim().length >= 2 && !picked ? hits : [];

  return (
    <div className="relative">
      <input
        name="name"
        required
        maxLength={60}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (picked) {
            setPicked(null);
            onPick(null);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(shown.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter" && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("games.namePh")}
        aria-label={t("games.game")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown.length > 0}
        aria-controls={listId}
        aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={input}
      />
      {picked?.kind === "catalog" && <input type="hidden" name="catalogId" value={picked.id} />}
      {picked?.kind === "steam" && <input type="hidden" name="steamAppId" value={picked.appId} />}
      {shown.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("games.suggestions")}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-bit border border-line bg-surface py-1 shadow-xl"
        >
          {shown.map((h, i) => (
            <li
              key={h.kind === "catalog" ? h.id : `steam-${h.appId}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(h);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-1.5 text-sm ${i === active ? "bg-raised" : ""}`}
            >
              {h.kind === "catalog" && h.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.cover} alt="" className="h-7 w-[60px] shrink-0 rounded object-cover" />
              ) : (
                <span aria-hidden className="h-7 w-[60px] shrink-0 rounded bg-raised" />
              )}
              <span className="min-w-0 flex-1 truncate text-fg">{h.name}</span>
              <span className="shrink-0 text-xs text-faint">
                {h.kind === "steam" ? t("games.fromSteam") : h.sizeGb != null ? `${h.sizeGb} GB` : t("games.inCatalog")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
