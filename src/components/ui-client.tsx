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

