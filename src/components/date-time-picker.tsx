"use client";
import { useEffect, useId, useRef, useState } from "react";
import { btnGhost, btnPrimary } from "./ui";
import { useT } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { fmtDate } from "@/lib/format";

/**
 * Date and time picker, always 24h (the browser's own datetime-local input
 * shows AM/PM for English locales). The form value stays "YYYY-MM-DDTHH:MM" in
 * server-local time, so the server actions don't change.
 *
 * The field is a normal text box: type "14.11.2026 18:00" (or "14.11. 18", "14.11.26 1800"),
 * or copy the text from one date field and paste it into another. The calendar
 * button opens a month view with quick times.
 */

// Monday first, as in Switzerland.
const WEEKDAYS: Record<Locale, string[]> = {
  en: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"],
  de: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
};
const monthName = (m: number, loc: Locale) => new Date(2000, m, 1).toLocaleString(loc, { month: "long" });
const pad = (n: number) => String(n).padStart(2, "0");

type Parts = { y: number; m: number; d: number; hh: number; mm: number };

function parse(v: string): Parts | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v);
  return r ? { y: +r[1], m: +r[2] - 1, d: +r[3], hh: +r[4], mm: +r[5] } : null;
}
/**
 * Reads what people type or paste: "Sat 14.11.2026, 18:00", "14.11.26 18", "14.11. 1800",
 * "14/11/2026 18.30" or "2026-11-14T18:00". A missing year means the next such date;
 * a missing time uses `fallback`.
 */
export function parseTyped(text: string, fallback: { hh: number; mm: number }, now = new Date()): Parts | null {
  const t = text.trim();
  if (!t) return null;
  const iso = parse(t);
  if (iso) return iso;
  const m = /(\d{1,2})[./-](\d{1,2})[./-]?(\d{2,4})?\s*,?\s*(?:(\d{1,2})(?:[:.h]?(\d{2}))?)?\s*$/.exec(t);
  if (!m) return null;
  const d = +m[1];
  const mo = +m[2] - 1;
  let y = m[3] ? +m[3] : now.getFullYear();
  if (m[3] && m[3].length === 2) y += 2000;
  const hh = m[4] !== undefined ? +m[4] : fallback.hh;
  const mm = m[5] !== undefined ? +m[5] : m[4] !== undefined ? 0 : fallback.mm;
  if (mo < 0 || mo > 11 || hh > 23 || mm > 59) return null;
  const date = new Date(y, mo, d);
  if (date.getMonth() !== mo) return null; // e.g. 31.02.
  // No year given and the date already passed this year: next year.
  if (!m[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) y += 1;
  return { y, m: mo, d, hh, mm };
}

const serialize = (p: Parts) => `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;

/** "Sat 14.11.2026, 18:00" */
export function formatPickerValue(v: string, loc: Locale = "en") {
  const p = parse(v);
  if (!p) return "";
  return fmtDate(new Date(p.y, p.m, p.d, p.hh, p.mm), loc);
}

/** "14.11.2026 18:00": the editable text form. */
const editText = (v: string) => {
  const p = parse(v);
  return p ? `${pad(p.d)}.${pad(p.m + 1)}.${p.y} ${pad(p.hh)}:${pad(p.mm)}` : "";
};

const QUICK_TIMES = ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "23:59"];

export function DateTimePicker({
  name,
  defaultValue = "",
  value: controlled,
  onChange,
  required,
  defaultTime = "18:00",
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  /** Controlled value ("YYYY-MM-DDTHH:MM" or ""), e.g. when another field fills this one in. */
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  /** Time used when someone picks a day before setting a time. */
  defaultTime?: string;
  placeholder?: string;
}) {
  const t = useT();
  const loc = t.locale;
  placeholder ??= t("picker.pick");
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = (v: string) => {
    if (controlled === undefined) setOwn(v);
    onChange?.(v);
  };
  const [text, setText] = useState<string | null>(null); // while typing
  const [bad, setBad] = useState(false);
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
      <div
        className={`flex min-h-11 w-full items-center rounded-md border bg-raised transition sm:min-h-10 ${
          bad ? "border-danger" : open ? "border-bit ring-2 ring-bit/25" : "border-line hover:border-muted/40"
        }`}
      >
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          aria-label={placeholder}
          title={t("picker.typeHint")}
          placeholder={placeholder}
          value={text ?? (value ? formatPickerValue(value, loc) : "")}
          onFocus={(e) => {
            setText(editText(value));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            setText(e.target.value);
            setBad(false);
          }}
          onBlur={() => {
            if (text === null) return;
            const t = text.trim();
            if (!t) {
              if (!required) setValue("");
            } else {
              const p = parseTyped(t, { hh: dh, mm: dm });
              if (p) {
                setValue(serialize(p));
                setView({ y: p.y, m: p.m });
              } else setBad(true);
            }
            setText(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "ArrowDown" && !open) openPicker();
          }}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-base text-fg placeholder:font-sans placeholder:text-faint focus:outline-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={popId}
          aria-label={t("picker.open")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md text-muted hover:text-fg"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z" />
          </svg>
        </button>
      </div>
      {bad && <span className="mt-1 block text-xs text-danger">{t("picker.bad")}</span>}

      {open && (
        <div
          id={popId}
          role="dialog"
          aria-label={t("picker.choose")}
          className="absolute left-0 z-40 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-3 shadow-2xl shadow-black/60"
        >
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} className={`${btnGhost} !min-h-9 !px-2.5`} aria-label={t("picker.prev")}>
              ‹
            </button>
            <span className="text-sm font-semibold">
              {monthName(view.m, loc)} {view.y}
            </span>
            <button type="button" onClick={() => shift(1)} className={`${btnGhost} !min-h-9 !px-2.5`} aria-label={t("picker.next")}>
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {WEEKDAYS[loc].map((w) => (
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
                  aria-label={`${d} ${monthName(view.m, loc)} ${view.y}`}
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
            <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("picker.time")}</span>
            <select
              aria-label={t("picker.hour")}
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
              aria-label={t("picker.minute")}
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

          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_TIMES.map((qt) => {
              const [h, mi] = qt.split(":").map(Number);
              const on = current?.hh === h && current?.mm === mi;
              return (
                <button
                  key={qt}
                  type="button"
                  onClick={() => setPart({ hh: h, mm: mi })}
                  aria-pressed={on}
                  className={`rounded-bit border px-2 py-1 font-mono text-xs ${on ? "border-bit bg-bit-soft text-fg" : "border-line text-muted hover:text-fg"}`}
                >
                  {qt}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            {!required && value ? (
              <button type="button" className={`${btnGhost} !min-h-9`} onClick={() => {
                  setValue("");
                  setOpen(false);
                }}>
                {t("picker.clear")}
              </button>
            ) : (
              <span />
            )}
            <button type="button" className={`${btnPrimary} !min-h-9`} onClick={() => setOpen(false)}>
              {t("picker.done")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
