"use client";
import { useState, useTransition } from "react";
import { adminAutoAssignSeats, setSeatsFromList } from "@/app/actions";
import { btnPrimary, btnSecondary, input } from "./ui";

/** Orga tools: enter the seats the event gave the group, and auto-fill them. */
export function SeatSetup({
  lanId,
  current,
  unseated,
  free,
}: {
  lanId: string;
  current: string;
  unseated: number;
  free: number;
}) {
  const [pending, start] = useTransition();
  const [spec, setSpec] = useState(current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm text-zinc-300" htmlFor="seat-spec">
          Seats the event gave us
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="seat-spec"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder="e.g. F1-F20  or  F1-F10, G1-G10"
            className={`${input} min-w-0 flex-1 font-mono`}
          />
          <button
            disabled={pending || !spec.trim()}
            className={btnPrimary}
            onClick={() =>
              start(async () => {
                const r = await setSeatsFromList(lanId, spec);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: `Saved ${r.count} seats.` });
              })
            }
          >
            Save seats
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Each letter becomes a row. Existing assignments are kept for seats that stay in the list.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || unseated === 0 || free === 0}
          className={btnSecondary}
          onClick={() =>
            start(async () => {
              const n = await adminAutoAssignSeats(lanId);
              setMsg({ ok: true, text: `Assigned ${n} seat(s).` });
            })
          }
        >
          Auto-assign free seats
        </button>
        <span className="text-xs text-zinc-500">
          {unseated} going without a seat · {free} free seats. People with a ticket go first.
        </span>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-bit" : "text-red-400"}`}>{msg.text}</p>}
    </div>
  );
}
