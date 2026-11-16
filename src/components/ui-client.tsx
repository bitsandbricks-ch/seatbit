"use client";
import type { AttendanceStatus } from "@/db/schema";
import { useT } from "@/i18n/client";

const statusStyles: Record<AttendanceStatus | "none", string> = {
  going: "bg-bit-soft text-bit border-bit/30",
  maybe: "bg-warn/15 text-warn border-warn/30",
  declined: "bg-line/60 text-muted border-line",
  waitlist: "bg-seat-taken/15 text-seat-taken border-seat-taken/30",
  none: "bg-raised text-muted border-line",
};

/** A member's status at a LAN: no answer, attending, seat claimed, waitlist (full), maybe, not going. */
export function StatusBadge({
  status,
  seat,
}: {
  status: AttendanceStatus | null | undefined;
  seat?: string | null;
}) {
  const s = status ?? "none";
  const t = useT();
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[s]}`}>
      {s === "going" && seat ? t("status.seat", { seat }) : t(`status.${s}`)}
    </span>
  );
}

const lockIcon = (
  <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden className="shrink-0">
    <path fill="currentColor" d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1 1 0 0 1 13 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.5 0h4V5a2 2 0 0 0-4 0z" />
  </svg>
);
const clockIcon = (
  <svg viewBox="0 0 16 16" width={12} height={12} aria-hidden className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </svg>
);
/** Icons for <Hint>; add one here instead of inlining SVG at the call site. */
export const HINT_ICONS = { lock: lockIcon, clock: clockIcon } as const;

const hintTones = {
  bit: "bg-bit-soft text-bit border-bit/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  muted: "bg-raised text-muted border-line",
} as const;

/**
 * A short label with an icon, and the long explanation on hover (desktop) or tap (phones,
 * where there is no hover). Instead of a badge plus a sentence: "🔒 Final" explains itself on demand.
 */
export function Hint({
  icon,
  label,
  children,
  tone = "muted",
  className = "",
}: {
  icon?: keyof typeof HINT_ICONS;
  /** Short text next to the icon; leave out for an icon alone (then it is the screen reader text). */
  label?: string;
  /** The explanation shown on hover or tap. */
  children: string;
  tone?: keyof typeof hintTones | `status-${AttendanceStatus}`;
  className?: string;
}) {
  const toneCls = tone.startsWith("status-") ? statusStyles[tone.slice(7) as AttendanceStatus] : hintTones[tone as keyof typeof hintTones];
  return (
    <details className={`relative shrink-0 ${className}`}>
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium [&::-webkit-details-marker]:hidden ${toneCls}`}
        title={children}
      >
        {icon && HINT_ICONS[icon]}
        {label ?? <span className="sr-only">{children}</span>}
      </summary>
      <p className="absolute right-0 top-full z-20 mt-1.5 w-64 whitespace-normal rounded-md border border-line bg-raised p-2.5 text-xs font-normal text-fg shadow-lg">{children}</p>
    </details>
  );
}

/**
 * A locked answer (the member has a ticket) as a small badge instead of the big answer card.
 * Tapping it shows who can still change it.
 */
export function LockedAnswerBadge({ status }: { status: AttendanceStatus }) {
  const t = useT();
  return (
    <Hint icon="lock" tone={`status-${status}`} label={t(`status.${status}`)} className="[&>p]:left-0 [&>p]:right-auto">
      {t("event.locked")}
    </Hint>
  );
}

/**
 * Check mark after a name: this person has their own account (signed in with Discord),
 * not a guest a lead typed in.
 */
export function Verified({ size = 14 }: { size?: number }) {
  const t = useT();
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      role="img"
      aria-label={t("status.verified")}
      className="inline-block shrink-0 align-[-0.125em] text-bit"
    >
      <title>{t("status.verifiedTitle")}</title>
      <path
        fill="currentColor"
        d="M8 0.8l1.7 1.3 2.1-.2.8 2 2 .8-.2 2.1L15.7 8l-1.3 1.7.2 2.1-2 .8-.8 2-2.1-.2L8 15.7l-1.7-1.3-2.1.2-.8-2-2-.8.2-2.1L.3 8l1.3-1.7-.2-2.1 2-.8.8-2 2.1.2z"
      />
      <path fill="none" stroke="var(--color-ink)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M5.2 8.2l1.9 1.9 3.8-4" />
    </svg>
  );
}

