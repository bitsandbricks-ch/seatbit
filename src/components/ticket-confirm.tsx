"use client";
import { useState, useTransition } from "react";
import { setMyTicketBought } from "@/app/actions";

/** "I have my ticket" checkbox for members (sets ticketBought). Locked once a lead confirmed the ticket. */
export function TicketConfirm({ lanId, bought, confirmed, label }: { lanId: string; bought: boolean; confirmed: boolean; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <label className="flex items-center gap-3 rounded-md border border-line bg-raised px-3 py-2.5 text-sm">
        <input
          type="checkbox"
          key={String(bought || confirmed)}
          defaultChecked={bought || confirmed}
          disabled={pending || confirmed}
          onChange={(e) => {
            const v = e.target.checked;
            start(async () => {
              setError(null);
              try {
                await setMyTicketBought(lanId, v);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
          className="h-5 w-5 accent-bit"
        />
        <span>
          {label ?? "I have my ticket"}
          {confirmed && <span className="ml-1 text-xs text-muted">(confirmed by a lead)</span>}
        </span>
      </label>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
