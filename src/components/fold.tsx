"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A folded section that remembers whether you opened it (per browser, per key), so a reload or a live
 * refresh doesn't fold it away again while you work in it. `open` forces it open, e.g. while it's in use.
 */
export function Fold({ id, storageKey, open, summary, children }: { id?: string; storageKey: string; open?: boolean; summary: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Left uncontrolled on purpose: a live refresh must never fold it away under you.
  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(storageKey) === "1";
    } catch {
      // Storage blocked: just start folded.
    }
    if ((open || stored) && ref.current) ref.current.open = true;
  }, [open, storageKey]);
  return (
    <details
      id={id}
      ref={ref}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        try {
          localStorage.setItem(storageKey, now ? "1" : "0");
        } catch {
          // Not remembered then.
        }
      }}
      className="group scroll-mt-20"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3 sm:px-5">
        {summary}
        <span aria-hidden className="text-muted transition group-open:rotate-90">
          ›
        </span>
      </summary>
      {children}
    </details>
  );
}
