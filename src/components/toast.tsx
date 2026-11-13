"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useT } from "@/i18n/client";

// App-wide toasts: short notes at the bottom of the screen after something was saved or
// failed. One module-level store, so any client code can call toast.success()/toast.error()
// without a provider; the <Toaster /> in the root layout shows them and survives navigation.

export type ToastTone = "success" | "error";
type Toast = { id: number; tone: ToastTone; text: string; bump: number };

const MAX = 3;
const DURATION: Record<ToastTone, number> = { success: 4000, error: 8000 };

let items: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(tone: ToastTone, text: string) {
  const same = items.find((x) => x.tone === tone && x.text === text);
  // The same note again (a second save) restarts the timer instead of stacking up.
  items = same
    ? items.map((x) => (x === same ? { ...x, bump: x.bump + 1 } : x))
    : [...items, { id: nextId++, tone, text, bump: 0 }].slice(-MAX);
  emit();
}

function dismiss(id: number) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export const toast = {
  success: (text: string) => push("success", text),
  error: (text: string) => push("error", text),
  dismiss,
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;
const serverSnapshot = (): Toast[] => [];

function Icon({ tone }: { tone: ToastTone }) {
  return tone === "success" ? (
    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bit text-on-bit">
      <svg viewBox="0 0 16 16" width={14} height={14}>
        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" />
      </svg>
    </span>
  ) : (
    <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-danger font-mono text-sm font-bold text-white">
      !
    </span>
  );
}

function ToastItem({ t }: { t: Toast }) {
  const tr = useT();
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (paused) return;
    timer.current = setTimeout(() => dismiss(t.id), DURATION[t.tone]);
    return () => clearTimeout(timer.current);
  }, [t.id, t.tone, t.bump, paused]);
  return (
    <li
      // Hover or keyboard focus keeps it open, so there's time to read a long error.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-card border bg-surface p-3 text-sm text-fg shadow-lg shadow-black/30 motion-safe:animate-[toast-in_160ms_ease-out] ${
        t.tone === "success" ? "border-bit/40" : "border-danger/50"
      }`}
    >
      <Icon tone={t.tone} />
      <p className="min-w-0 flex-1 self-center whitespace-pre-line break-words">{t.text}</p>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label={tr("toast.close")}
        className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-raised hover:text-fg"
      >
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden>
          <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </li>
  );
}

/** Shows the toasts. Once, in the root layout. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const t = useT();
  // Two live regions that are always in the page: screen readers only announce changes
  // inside a region that already exists. Errors interrupt, success waits its turn.
  const region = (tone: ToastTone) => (
    <ol
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-label={t(tone === "error" ? "toast.errors" : "toast.notes")}
      className="flex w-full flex-col gap-2 [&:not(:empty)+ol:not(:empty)]:mt-2"
    >
      {list.filter((x) => x.tone === tone).map((x) => (
        <ToastItem key={x.id} t={x} />
      ))}
    </ol>
  );
  return (
    // Phones: above the bottom tab bar. Wider screens: bottom right corner, clear of the centred
    // footer links (the commit hash has the left corner).
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:px-0">
      <div className="w-full max-w-sm">
        {region("success")}
        {region("error")}
      </div>
    </div>
  );
}
