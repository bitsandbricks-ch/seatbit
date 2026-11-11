import type { AttendanceStatus } from "@/db/schema";
import type { ComponentProps, ReactNode } from "react";

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPrimary = `${btn} bg-bit text-ink hover:bg-bit-hover`;
export const btnSecondary = `${btn} bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700`;
export const btnDanger = `${btn} bg-red-600/90 text-white hover:bg-red-500`;
export const btnGhost = `${btn} text-zinc-300 hover:bg-zinc-800`;
export const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-bit focus:outline-none";
export const label = "block text-xs font-medium uppercase tracking-wide text-zinc-400 mb-1";

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
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const statusStyles: Record<AttendanceStatus | "none", string> = {
  going: "bg-bit-soft text-bit border-bit/30",
  maybe: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  declined: "bg-zinc-700/40 text-zinc-400 border-zinc-600",
  waitlist: "bg-seat-taken/15 text-seat-taken border-seat-taken/30",
  none: "bg-zinc-800 text-zinc-400 border-zinc-700",
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
    zinc: "bg-zinc-800 text-zinc-300",
    red: "bg-red-500/15 text-red-300",
    emerald: "bg-bit-soft text-bit",
    amber: "bg-amber-500/15 text-amber-300",
  };
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function Field({ label: l, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={label}>{l}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${input} ${props.className ?? ""}`} />;
}
