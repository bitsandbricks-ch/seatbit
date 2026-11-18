"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { SidePanel } from "./side-panel";
import { useT } from "@/i18n/client";
import type { GuideStep } from "@/lib/event-guide";

// "How this event works": one panel per page (side panel on desktop, bottom sheet on phones), opened by
// any number of buttons (checklist, header, waitlist line) through a window event, so they share it.
const OPEN = "seatbit:event-guide";

export function EventGuideButton({ variant = "link", children }: { variant?: "link" | "icon"; children?: ReactNode }) {
  const t = useT();
  const open = () => window.dispatchEvent(new Event(OPEN));
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={t("howItWorks.button")}
        title={t("howItWorks.button")}
        className="grid size-8 place-items-center rounded-full text-muted transition hover:bg-raised hover:text-fg"
      >
        <svg viewBox="0 0 20 20" className="size-[18px]" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7.9 7.7a2.2 2.2 0 1 1 3 2.1c-.6.3-.9.7-.9 1.3v.3" />
          <circle cx="10" cy="14" r=".4" fill="currentColor" />
        </svg>
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className="text-sm font-medium text-bit hover:underline">
      {children ?? t("howItWorks.button")} <span aria-hidden>›</span>
    </button>
  );
}

export function EventGuidePanel({
  steps,
  leads,
}: {
  steps: GuideStep[];
  /** The event's leads with their contact links, rendered on the server. */
  leads?: ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN, on);
    return () => window.removeEventListener(OPEN, on);
  }, []);
  if (!open) return null;
  return (
    <SidePanel title={t("howItWorks.title")} onClose={() => setOpen(false)}>
      <ol>
        {steps.map((s, i) => (
          <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  s.state === "done" ? "bg-bit text-on-bit" : s.state === "now" ? "border-2 border-bit text-bit" : "border border-line text-muted"
                }`}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              {i < steps.length - 1 && <span aria-hidden className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className={`min-w-0 flex-1 ${s.state === "now" ? "-mt-1 rounded-lg border border-bit/40 bg-bit-soft p-3" : "pt-0.5"}`}>
              <p className={`font-semibold ${s.state === "done" ? "text-muted" : "text-fg"}`}>
                {s.title}
                {s.state === "now" && <span className="ml-2 rounded-full bg-bit/15 px-2 py-0.5 text-xs font-medium text-bit">{t("howItWorks.youAreHere")}</span>}
              </p>
              <p className={`mt-1 text-sm ${s.state === "now" ? "text-fg" : "text-muted"}`}>{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-5 rounded-lg border border-line bg-raised p-4">
        <p className="font-semibold">{t("howItWorks.whoTitle")}</p>
        <p className="mt-1 text-sm text-muted">{t("howItWorks.who")}</p>
        {leads}
      </div>
      <p className="mt-4 text-sm">
        <Link href="/help#events" className="font-medium text-bit hover:underline" onClick={() => setOpen(false)}>
          {t("howItWorks.moreHelp")} <span aria-hidden>→</span>
        </Link>
      </p>
    </SidePanel>
  );
}
