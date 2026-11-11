"use client";
import { useEffect, useMemo, useState, useTransition, type DragEvent } from "react";
import {
  adminAssignSeat,
  adminSetSeatFor,
  adminSwapSeats,
  renameSeat,
  toggleSeatCell,
  toggleSeatLock,
  toggleSeatRow,
} from "@/app/actions";
import { rowLetter } from "@/lib/seat-labels";
import { Pill, btnGhost, btnPrimary, btnSecondary, input } from "./ui";

export type SeatView = {
  id: string;
  row: number;
  col: number;
  label: string;
  userId: string | null;
  locked: boolean;
  nick: string | null;
};

/** Extra info orgas see about a person in the details pane. */
export type SeatPerson = {
  id: string;
  nick: string;
  name?: string;
  lanAccount?: string;
  ticket?: "ok" | "reported" | "open";
  wishes?: { ok: string[]; missed: string[] };
};

type Zoom = "compact" | "large";
const ZOOM_KEY = "seatbit:seat-zoom";

/**
 * The group's seat block.
 *
 * Compact by default: small seats with the label or the first letters of the nick, so even a big block fits
 * on a phone without scrolling. Tapping a seat opens a details pane (side panel on wide screens, bottom sheet
 * on phones). "Large" shows whole nicks on every seat and is remembered per device.
 *
 * Orgas (mode "admin") edit right in the map: tap a seat to assign/move someone, swap two seats, clear or hold
 * it, rename it; tap someone in "Not seated yet" and then a seat; or drag people around on desktop. "Edit seats"
 * switches to adding/removing seats (aisles).
 */
export function SeatMap({
  lanId,
  rows,
  cols,
  seats,
  meId,
  mode,
  assignable = [],
}: {
  lanId: string;
  rows: number;
  cols: number;
  seats: SeatView[];
  meId: string;
  mode: "view" | "admin";
  assignable?: SeatPerson[];
}) {
  const admin = mode === "admin";
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoomState] = useState<Zoom>("compact");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [swapFrom, setSwapFrom] = useState<string | null>(null);
  const [placing, setPlacing] = useState<string | null>(null); // userId waiting for a seat tap
  const [layout, setLayout] = useState(false);
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState<string | null>(null);

  useEffect(() => {
    try {
      const z = localStorage.getItem(ZOOM_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read the per-device preference after hydration
      if (z === "large" || z === "compact") setZoomState(z);
    } catch {}
  }, []);
  const setZoom = (z: Zoom) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, z);
    } catch {}
  };

  const byPos = useMemo(() => new Map(seats.map((s) => [`${s.row}:${s.col}`, s])), [seats]);
  const byId = useMemo(() => new Map(seats.map((s) => [s.id, s])), [seats]);
  const people = useMemo(() => new Map(assignable.map((p) => [p.id, p])), [assignable]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const mySeat = seats.find((s) => s.userId === meId);
  const seatOfUser = new Map(seats.filter((s) => s.userId).map((s) => [s.userId!, s]));
  const unseated = assignable.filter((p) => !seatOfUser.has(p.id));
  const q = query.trim().toLowerCase();
  const matches = (s: SeatView) =>
    !q ||
    s.label.toLowerCase() === q ||
    (!!s.nick && s.nick.toLowerCase().includes(q)) ||
    (!!s.userId && (people.get(s.userId)?.name ?? "").toLowerCase().includes(q));
  const matchCount = q ? seats.filter(matches).length : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSelectedId(null);
      setSwapFrom(null);
      setPlacing(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });

  /** Puts a person on a seat, or swaps when moving between two seats. */
  const moveTo = (target: SeatView, from: { seatId?: string; userId?: string }) => {
    if (from.seatId) {
      if (from.seatId !== target.id) run(() => adminSwapSeats(from.seatId!, target.id));
    } else if (from.userId) {
      run(() => adminSetSeatFor(lanId, from.userId!, target.id));
    }
    setSelectedId(target.id);
  };

  function onCell(row: number, col: number, s?: SeatView) {
    if (admin && layout) {
      if (s?.userId && !confirm(`${s.label} is taken by ${s.nick}. Remove the seat anyway?`)) return;
      return run(() => toggleSeatCell(lanId, row, col));
    }
    if (!s) return;
    if (admin && swapFrom) {
      moveTo(s, { seatId: swapFrom });
      setSwapFrom(null);
      return;
    }
    if (admin && placing) {
      moveTo(s, { userId: placing });
      setPlacing(null);
      return;
    }
    const next = selectedId === s.id ? null : s.id;
    setSelectedId(next);
    // Phones: the details sheet covers the lower half, so bring the tapped seat up.
    if (next && window.matchMedia("(max-width: 1023px)").matches) {
      document.querySelector(`[data-seat="${next}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  // ---------- drag & drop (desktop, orgas) ----------
  const canDrag = admin && !layout;
  const onDragStartSeat = (e: DragEvent, s: SeatView) => {
    e.dataTransfer.setData("text/plain", `seat:${s.id}`);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragStartPerson = (e: DragEvent, userId: string) => {
    e.dataTransfer.setData("text/plain", `user:${userId}`);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, target: SeatView) => {
    e.preventDefault();
    setDragOver(null);
    const [kind, id] = e.dataTransfer.getData("text/plain").split(":");
    if (kind === "seat") moveTo(target, { seatId: id });
    if (kind === "user") moveTo(target, { userId: id });
  };

  const compact = zoom === "compact";
  // Compact seats fit a 10-wide block on a 390px phone without scrolling.
  const cell = compact ? "h-8 sm:h-10" : "h-[4.5rem]";
  const colW = compact ? "minmax(var(--seat-min), 1fr)" : "minmax(4.75rem, 1fr)";
  const maxW = compact ? `${cols * 3.25 + 1.5}rem` : undefined;

  const hint = layout
    ? "Tap a cell to add or remove a seat, or a row letter to fill or clear the row."
    : swapFrom
      ? `Tap the seat to swap ${byId.get(swapFrom)?.label} with, or a free seat to move there.`
      : placing
        ? `Tap a seat for ${people.get(placing)?.nick ?? "them"}.`
        : null;

  return (
    <div className={`space-y-3 ${pending ? "cursor-progress" : ""}`}>
      {/* Toolbar: search, zoom, orga layout mode */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-40">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find someone"
            aria-label="Find someone on the seat plan"
            className={`${input} !min-h-9 pl-8`}
          />
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.5-4.5" />
          </svg>
        </div>
        <div role="group" aria-label="Seat size" className="inline-flex rounded-md border border-line bg-raised p-0.5 text-xs">
          {(["compact", "large"] as Zoom[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`min-h-8 rounded px-2.5 font-medium capitalize transition ${zoom === z ? "bg-line text-fg" : "text-muted hover:text-fg"}`}
            >
              {z}
            </button>
          ))}
        </div>
        {admin && (
          <button
            type="button"
            onClick={() => {
              setLayout(!layout);
              setSelectedId(null);
              setSwapFrom(null);
              setPlacing(null);
            }}
            aria-pressed={layout}
            className={`${layout ? btnSecondary + " !border-bit" : btnGhost} !min-h-9`}
          >
            {layout ? "Done editing seats" : "Edit seats"}
          </button>
        )}
      </div>

      {mode === "view" && (
        <p className="text-sm text-muted">
          {mySeat ? (
            <>
              You&apos;re at <strong className="font-mono text-bit">{mySeat.label}</strong>. Tap a seat to see who sits there.
            </>
          ) : (
            "The orgas assign the group's seats after the deadline."
          )}
        </p>
      )}
      {q && (
        <p className="text-xs text-muted" aria-live="polite">
          {matchCount ? `${matchCount} match${matchCount > 1 ? "es" : ""} highlighted` : "Nobody found on the plan"}
        </p>
      )}
      {hint && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-bit/30 bg-bit-soft px-3 py-2 text-sm text-fg" aria-live="polite">
          {hint}
          {(swapFrom || placing) && (
            <button type="button" className="ml-auto text-sm text-muted underline hover:text-fg" onClick={() => (setSwapFrom(null), setPlacing(null))}>
              Cancel
            </button>
          )}
        </p>
      )}

      <div className={compact ? "grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]" : "space-y-4"}>
        <div className="min-w-0 space-y-3">
          <div className={`overflow-x-auto pb-1 ${pending ? "opacity-70" : ""}`}>
            <div
              className="grid gap-[3px] [--seat-min:1.625rem] sm:gap-1 sm:[--seat-min:2.25rem]"
              style={{
                gridTemplateColumns: `1.25rem repeat(${cols}, ${colW})`,
                maxWidth: maxW,
                minWidth: compact ? undefined : `calc(${cols} * 5rem + 1.25rem)`,
              }}
            >
              {Array.from({ length: rows * (cols + 1) }, (_, j) => {
                const row = Math.floor(j / (cols + 1));
                const col = (j % (cols + 1)) - 1;
                const key = `${row}:${col}`;
                if (col === -1) {
                  const first = seats.find((x) => x.row === row);
                  const letter = first?.label.match(/^[A-Za-z]+/)?.[0] ?? rowLetter(row);
                  return admin && layout ? (
                    <button
                      key={key}
                      onClick={() => run(() => toggleSeatRow(lanId, row))}
                      className={`${cell} rounded font-mono text-xs text-muted hover:bg-raised hover:text-fg`}
                      title={`Fill or clear row ${letter}`}
                    >
                      {letter}
                    </button>
                  ) : (
                    <div key={key} className={`${cell} grid place-items-center font-mono text-[11px] text-faint`}>
                      {first ? letter : ""}
                    </div>
                  );
                }
                const s = byPos.get(key);
                if (!s) {
                  return admin && layout ? (
                    <button
                      key={key}
                      onClick={() => onCell(row, col)}
                      className={`${cell} rounded-bit border border-dashed border-line hover:border-muted/50`}
                      aria-label={`Add seat at row ${row + 1}, column ${col + 1}`}
                    />
                  ) : (
                    <div key={key} className={cell} />
                  );
                }
                const mine = s.userId === meId;
                const taken = !!s.userId;
                const isSel = selectedId === s.id || swapFrom === s.id;
                const hit = q && matches(s);
                const dim = q && !hit;
                const tone = mine
                  ? "bg-bit text-on-bit border-bit"
                  : taken
                    ? "bg-seat-taken/20 text-seat-taken border-seat-taken/40"
                    : s.locked
                      ? "bg-raised/60 text-faint border-line [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,.05)_3px,rgba(255,255,255,.05)_6px)]"
                      : "bg-raised text-muted border-line";
                const ring = isSel
                  ? "ring-2 ring-fg ring-offset-2 ring-offset-surface"
                  : hit
                    ? "ring-2 ring-warn ring-offset-1 ring-offset-surface"
                    : dragOver === s.id
                      ? "ring-2 ring-bit"
                      : "";
                const short = s.nick ? s.nick.slice(0, 3) : s.label;
                return (
                  <button
                    key={key}
                    type="button"
                    data-seat={s.id}
                    onClick={() => onCell(row, col, s)}
                    draggable={canDrag && taken}
                    onDragStart={(e) => onDragStartSeat(e, s)}
                    onDragOver={canDrag ? (e) => (e.preventDefault(), setDragOver(s.id)) : undefined}
                    onDragLeave={canDrag ? () => setDragOver(null) : undefined}
                    onDrop={canDrag ? (e) => onDrop(e, s) : undefined}
                    title={`${s.label}${s.nick ? ` · ${s.nick}` : ""}${s.locked ? " · held" : ""}`}
                    aria-label={`Seat ${s.label}${s.nick ? `, ${s.nick}` : ", free"}${s.locked ? ", held" : ""}`}
                    aria-pressed={isSel}
                    className={`relative flex ${cell} min-w-0 flex-col items-center justify-center overflow-hidden rounded-bit border px-0.5 text-center transition hover:brightness-125 ${tone} ${ring} ${dim ? "opacity-25" : ""} ${canDrag && taken ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    {compact ? (
                      <span className={`w-full truncate font-mono leading-none ${taken ? "text-[11px] font-semibold" : "text-[10px]"}`}>
                        {short}
                      </span>
                    ) : (
                      <>
                        <span className="font-mono text-[11px] leading-none opacity-75">
                          {s.label}
                          {s.locked ? " 🔒" : ""}
                        </span>
                        {s.nick && (
                          <span className="mt-0.5 line-clamp-2 w-full text-xs font-semibold leading-tight [overflow-wrap:anywhere]">{s.nick}</span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Legend cls="bg-raised border-line">Free</Legend>
            <Legend cls="bg-bit border-bit">You</Legend>
            <Legend cls="bg-seat-taken/20 border-seat-taken/40">Taken</Legend>
            <Legend cls="bg-raised/60 border-line">Held</Legend>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}

          {admin && !layout && unseated.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                Not seated yet <span className="text-faint">{unseated.length}</span>
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {unseated.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => onDragStartPerson(e, p.id)}
                      onClick={() => {
                        setPlacing(placing === p.id ? null : p.id);
                        setSwapFrom(null);
                        setSelectedId(null);
                      }}
                      aria-pressed={placing === p.id}
                      className={`min-h-8 cursor-grab rounded-full border px-3 text-xs font-medium transition ${
                        placing === p.id ? "border-bit bg-bit-soft text-bit" : "border-line bg-raised text-fg hover:border-muted/40"
                      }`}
                    >
                      {p.nick}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 hidden text-xs text-faint lg:block">Drag a name onto a seat, or a seated person onto another seat to swap.</p>
            </div>
          )}
        </div>

        {/* Details: side panel on wide screens (compact zoom), bottom sheet on phones. */}
        {!layout && (
          <>
            <aside className={compact ? "hidden lg:block" : "hidden"}>
              <div className="sticky top-20 rounded-card border border-line bg-raised/30 p-4">
                {selected ? (
                  <SeatDetails
                    key={selected.id}
                    seat={selected}
                    person={selected.userId ? people.get(selected.userId) : undefined}
                    meId={meId}
                    admin={admin}
                    assignable={assignable}
                    seatOfUser={seatOfUser}
                    pending={pending}
                    onClose={() => setSelectedId(null)}
                    onSwap={() => setSwapFrom(selected.id)}
                    run={run}
                    lanId={lanId}
                  />
                ) : (
                  <p className="text-sm text-muted">
                    {admin
                      ? "Tap a seat to see who sits there, assign someone, swap, hold or rename it."
                      : "Tap a seat to see who sits there."}
                  </p>
                )}
              </div>
            </aside>
            {selected && (
              <div
                className={`fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 sm:bottom-4 sm:left-auto sm:right-4 sm:w-80 ${compact ? "lg:hidden" : ""}`}
              >
                <div className="max-h-[70dvh] overflow-y-auto rounded-t-card border border-line bg-surface p-4 pt-2 shadow-2xl shadow-black/70 sm:rounded-card sm:pt-4">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
                  <SeatDetails
                    key={selected.id}
                    seat={selected}
                    person={selected.userId ? people.get(selected.userId) : undefined}
                    meId={meId}
                    admin={admin}
                    assignable={assignable}
                    seatOfUser={seatOfUser}
                    pending={pending}
                    onClose={() => setSelectedId(null)}
                    onSwap={() => {
                      setSwapFrom(selected.id);
                      setSelectedId(null);
                    }}
                    run={run}
                    lanId={lanId}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SeatDetails({
  seat: s,
  person,
  meId,
  admin,
  assignable,
  seatOfUser,
  pending,
  onClose,
  onSwap,
  run,
  lanId,
}: {
  seat: SeatView;
  person?: SeatPerson;
  meId: string;
  admin: boolean;
  assignable: SeatPerson[];
  seatOfUser: Map<string, SeatView>;
  pending: boolean;
  onClose: () => void;
  onSwap: () => void;
  run: (fn: () => Promise<unknown>) => void;
  lanId: string;
}) {
  const [pick, setPick] = useState("");
  const [label, setLabel] = useState(s.label);
  const [renaming, setRenaming] = useState(false);
  const mine = s.userId === meId;
  const status = mine ? "You" : s.userId ? "Taken" : s.locked ? "Held" : "Free";
  const tone = mine ? "emerald" : s.userId ? "zinc" : s.locked ? "amber" : "zinc";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Seat</p>
          <p className="font-mono text-2xl font-bold leading-tight">{s.label}</p>
        </div>
        <div className="flex items-center gap-1">
          <Pill tone={tone}>{status}</Pill>
          {s.locked && s.userId && <Pill tone="amber">Held</Pill>}
          <button type="button" onClick={onClose} className={`${btnGhost} !min-h-8 !px-2`} aria-label="Close">
            ✕
          </button>
        </div>
      </div>

      {s.userId ? (
        <div className="rounded-md bg-raised/60 p-3">
          <p className={`text-lg font-semibold leading-tight [overflow-wrap:anywhere] ${mine ? "text-bit" : ""}`}>{s.nick}</p>
          {person?.name && <p className="text-sm text-muted">{person.name}</p>}
          {person?.lanAccount && (
            <p className="mt-1 text-xs text-muted">
              Event account: <span className="font-mono text-fg">{person.lanAccount}</span>
            </p>
          )}
          {admin && person?.ticket && (
            <p className="mt-2">
              {person.ticket === "ok" ? (
                <Pill tone="emerald">ticket ok</Pill>
              ) : person.ticket === "reported" ? (
                <Pill tone="amber">ticket reported</Pill>
              ) : (
                <Pill tone="red">no ticket</Pill>
              )}
            </p>
          )}
          {admin && person?.wishes && (person.wishes.ok.length > 0 || person.wishes.missed.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-1">
              {person.wishes.ok.map((t) => (
                <Pill key={t} tone="emerald">
                  ✓ {t}
                </Pill>
              ))}
              {person.wishes.missed.map((t) => (
                <Pill key={t} tone="red">
                  ✗ {t}
                </Pill>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted">{s.locked ? "Held, e.g. for a guest. Members can't get it automatically." : "Nobody sits here yet."}</p>
      )}

      {admin && (
        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex gap-2">
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${input} !min-h-10 min-w-0 flex-1`} aria-label="Person for this seat">
              <option value="">{s.userId ? "Give seat to…" : "Assign someone…"}</option>
              {assignable
                .filter((p) => p.id !== s.userId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nick}
                    {seatOfUser.get(p.id) ? ` (now ${seatOfUser.get(p.id)!.label})` : ""}
                  </option>
                ))}
            </select>
            <button
              type="button"
              disabled={!pick || pending}
              className={btnPrimary}
              onClick={() => {
                const other = seatOfUser.get(pick);
                // Someone already seated: swap so the current occupant isn't silently dropped.
                if (other && s.userId) run(() => adminSwapSeats(other.id, s.id));
                else run(() => adminSetSeatFor(lanId, pick, s.id));
                setPick("");
              }}
            >
              {seatOfUser.get(pick) && s.userId ? "Swap" : "Assign"}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={btnSecondary} onClick={onSwap} disabled={pending}>
              {s.userId ? "Swap / move…" : "Move someone here…"}
            </button>
            {s.userId && (
              <button type="button" className={`${btnGhost} hover:!text-danger`} disabled={pending} onClick={() => run(() => adminAssignSeat(s.id, null))}>
                Clear
              </button>
            )}
            <button type="button" className={btnGhost} disabled={pending} onClick={() => run(() => toggleSeatLock(s.id))}>
              {s.locked ? "Release hold" : "Hold"}
            </button>
            <button type="button" className={btnGhost} onClick={() => setRenaming(!renaming)}>
              Rename
            </button>
          </div>
          {renaming && (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (label.trim()) run(() => renameSeat(s.id, label));
                setRenaming(false);
              }}
            >
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={12} className={`${input} !min-h-10 font-mono`} aria-label="Seat label" autoFocus />
              <button className={btnSecondary}>Save</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm border ${cls}`} />
      {children}
    </span>
  );
}
