"use client";
import { useEffect, useId, useRef, useState } from "react";
import { btnGhost, btnPrimary } from "./ui";

/**
 * Date and time picker, always 24h (the browser's own datetime-local input
 * shows AM/PM for English locales). The form value stays the same as before,
 * "YYYY-MM-DDTHH:MM" in server-local time, so the server actions don't change.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function parse(v: string): Parts | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return r ? { y: +r[1], m: +r[2] - 1, d: +r[3], hh: +r[4], mm: +r[5] } : null;
}
const serialize = (p: Parts) => `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;

/** "Sat 14.11.2026, 18:00" */
export function formatPickerValue(v: string) {
  const p = parse(v);
  if (!p) return "";
  const wd = DAY_NAMES[new Date(p.y, p.m, p.d).getDay()];
  return `${wd} ${pad(p.d)}.${pad(p.m + 1)}.${p.y}, ${pad(p.hh)}:${pad(p.mm)}`;
}

export function DateTimePicker({
  name,
  defaultValue = "",
  required,
  defaultTime = "18:00",
  placeholder = "Pick a date",
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  /** Time used when someone picks a day before setting a time. */
  defaultTime?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const current = parse(value);
  const today = new Date();
  const [view, setView] = useState(() => ({ y: current?.y ?? today.getFullYear(), m: current?.m ?? today.getMonth() }));
  const box = useRef<HTMLDivElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    // Bring the whole popover (incl. the time row) into view, clear of the phone tab bar.
    document.getElementById(popId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  }, [open, popId]);

  const [dh, dm] = defaultTime.split(":").map(Number);
  const setPart = (patch: Partial<Parts>) => {
    const base: Parts = current ?? { y: view.y, m: view.m, d: 1, hh: dh, mm: dm };
    setValue(serialize({ ...base, ...patch }));
  };

  const openPicker = () => {
    if (current) setView({ y: current.y, m: current.m });
    setOpen(true);
  };
  const shift = (delta: number) =>
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  // Monday-first month grid with leading blanks.
  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const isToday = (d: number) => d === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
  const isSel = (d: number) => !!current && d === current.d && view.m === current.m && view.y === current.y;

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);
  for (const extra of [current?.mm ?? dm]) {
    if (!minutes.includes(extra)) minutes.push(extra);
  }
  minutes.sort((a, b) => a - b);

  const selectCls =
    "min-h-10 rounded-md border border-line bg-raised px-2 font-mono text-base text-fg focus:border-bit focus:outline-none sm:text-sm";

  return (
    <div ref={box} className="relative">
      {/* Carries the value and native "required" validation; the button below is what people see. */}
      <input
        name={name}
        value={value}
        required={required}
        onChange={() => {}}
        onInvalid={openPicker}
        tabIndex={-1}
        inputMode="none"
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0"
      />
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-md border bg-raised px-3 py-2 text-left text-base transition sm:min-h-10 sm:text-sm ${
          open ? "border-bit ring-2 ring-bit/25" : "border-line hover:border-muted/40"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
        </svg>
        <span className={`flex-1 truncate ${value ? "font-mono text-fg" : "text-faint"}`}>
          {value ? formatPickerValue(value) : placeholder}
        </span>
      </button>

      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label="Choose date and time"
          className="absolute left-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 shadow-2xl shadow-black/60"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className={`${btnGhost} !min-h-9 !px-2.5`} aria-label="Previous month">
              ‹
            </button>
            <span className="text-sm font-semibold">
              {MONTHS[view.m]} {view.y}
            </span>
            <button type="button" onClick={() => shift(1)} className={`${btnGhost} !min-h-9 !px-2.5`} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="pb-1 text-[11px] font-medium uppercase text-muted">
                {w}
              </span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`b${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  onClick={() => setPart({ y: view.y, m: view.m, d })}
                  aria-pressed={isSel(d)}
                  aria-label={`${d} ${MONTHS[view.m]} ${view.y}`}
                  className={`grid h-9 place-items-center rounded-bit font-mono text-sm transition ${
                    isSel(d)
                      ? "bg-bit font-semibold text-on-bit"
                      : isToday(d)
                        ? "border border-bit/50 text-bit hover:bg-raised"
                        : "text-fg hover:bg-raised"
                  }`}
                >
                  {d}
                </button>
              ),
            )}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Time</span>
            <select
              aria-label="Hour"
              value={current?.hh ?? dh}
              onChange={(e) => setPart({ hh: +e.target.value })}
              className={selectCls}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {pad(h)}
                </option>
              ))}
            </select>
            <span className="font-mono text-muted">:</span>
            <select
              aria-label="Minute"
              value={current?.mm ?? dm}
              onChange={(e) => setPart({ mm: +e.target.value })}
              className={selectCls}
            >
              {minutes.map((m) => (
                <option key={m} value={m}>
                  {pad(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            {!required && value ? (
              <button type="button" className={`${btnGhost} !min-h-9`} onClick={() => {
                  setValue("");
                  setOpen(false);
                }}>
                Clear
              </button>
            ) : (
              <span />
            )}
            <button type="button" className={`${btnPrimary} !min-h-9`} onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
