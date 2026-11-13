"use client";
import { useState, useTransition } from "react";
import { adminSetSeatBooked } from "@/app/lan-extras-actions";
import { useT } from "@/i18n/client";

export type BookingRow = { userId: string; name: string; seat: string; lanAccount?: string; booked: boolean };

/** The leads' list for booking everyone's seat on the event's own seat plan, one tick per person. */
export function LeadBookingList({ lanId, rows }: { lanId: string; rows: BookingRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <BookingItem key={r.userId} lanId={lanId} row={r} />
      ))}
    </ul>
  );
}

function BookingItem({ lanId, row }: { lanId: string; row: BookingRow }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="py-2">
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          key={String(row.booked)}
          defaultChecked={row.booked}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            start(async () => {
              setError(null);
              try {
                await adminSetSeatBooked(lanId, row.userId, v);
              } catch (err) {
                setError(err instanceof Error ? err.message : t("eventUi.failed"));
              }
            });
          }}
          className="h-5 w-5 shrink-0 accent-bit"
        />
        <span className="w-12 shrink-0 font-mono font-semibold text-fg">{row.seat}</span>
        <span className="min-w-0 flex-1 truncate text-fg">{row.name}</span>
        {row.lanAccount && <span className="shrink-0 font-mono text-xs text-muted">ID {row.lanAccount}</span>}
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
    </li>
  );
}
