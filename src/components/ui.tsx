import type { AttendanceStatus } from "@/db/schema";
import type { ComponentProps, ReactNode } from "react";

/**
 * Buttons and inputs are 40px tall on phones (thumb-sized) and a bit tighter
 * from sm up. Inputs use 16px text on phones so iOS Safari doesn't zoom in on focus.
 */
export const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bit active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 sm:min-h-9 sm:py-1.5";
export const btnPrimary = `${btn} bg-bit text-on-bit hover:bg-bit-hover`;
export const btnSecondary = `${btn} border border-line bg-raised text-fg hover:border-muted/40 hover:bg-line`;
export const btnDanger = `${btn} bg-red-600/90 text-white hover:bg-red-500`;
export const btnGhost = `${btn} text-muted hover:bg-raised hover:text-fg`;
export const input =
  "w-full min-h-11 rounded-md border border-line bg-raised px-3 py-2 text-base text-fg placeholder:text-faint transition focus:border-bit focus:outline-none focus:ring-2 focus:ring-bit/25 disabled:opacity-60 sm:min-h-10 sm:text-sm";
export const label = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted";

export function Card({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-card border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 sm:mb-4">
          {title && <h2 className="text-base font-semibold tracking-tight text-fg sm:text-lg">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const statusStyles: Record<AttendanceStatus | "none", string> = {
  going: "bg-bit-soft text-bit border-bit/30",
  maybe: "bg-warn/15 text-warn border-warn/30",
  declined: "bg-line/60 text-muted border-line",
  waitlist: "bg-seat-taken/15 text-seat-taken border-seat-taken/30",
  none: "bg-raised text-muted border-line",
};
const statusText: Record<AttendanceStatus | "none", string> = {
  going: "Attending",
  maybe: "Unsure",
  declined: "Not going",
  waitlist: "Waitlist · full",
  none: "No answer",
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
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[s]}`}>
      {s === "going" && seat ? `Seat ${seat}` : statusText[s]}
    </span>
  );
}

export function Pill({ children, tone = "zinc" }: { children: ReactNode; tone?: "zinc" | "red" | "emerald" | "amber" }) {
  const tones = {
    zinc: "bg-raised text-fg/90",
    red: "bg-danger/15 text-danger",
    emerald: "bg-bit-soft text-bit",
    amber: "bg-warn/15 text-warn",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-bit px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${input} ${props.className ?? ""}`} />;
}

/** Page title row: heading, optional subtitle and actions that wrap below on phones. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const emptyIcons = {
  calendar: "M7 3v3M17 3v3M4 9h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8",
  seat: "M6 3v10h12M6 13v8M18 13v8M6 9h8",
  car: "M5 17h14M5 17v-5l2-5h10l2 5v5M5 17v2M19 17v2M8 14h.01M16 14h.01",
  box: "M4 8l8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8",
};

/** Friendly empty state: an icon, one line on what's missing, and what to do next. */
export function EmptyState({
  icon = "calendar",
  title,
  children,
  action,
}: {
  icon?: keyof typeof emptyIcons;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line px-6 py-10 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-bit-soft text-bit">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d={emptyIcons[icon]} />
        </svg>
      </span>
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Pulsing placeholder block for loading states. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-raised ${className}`} aria-hidden />;
}

/** A headline number with a label above and a short note below. */
export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="truncate text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
      {sub && <div className="truncate text-xs text-faint">{sub}</div>}
    </div>
  );
}
