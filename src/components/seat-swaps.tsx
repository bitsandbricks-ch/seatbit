"use client";
import { useState, useTransition } from "react";
import { answerSeatSwap, cancelSeatSwap, decideSeatSwap, requestSeatSwap } from "@/app/lan-extras-actions";
import { Pill, btnGhost, btnPrimary, btnSecondary, input } from "./ui";

export type SwapView = {
  id: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  fromSeat: string | null;
  toSeat: string | null;
  status: "pending" | "accepted";
  note: string;
};

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
      }
    });
  return { pending, error, run };
}

/** Member side: ask someone to swap, answer requests, see where yours stands. */
export function SeatSwapPanel({
  lanId,
  meId,
  mySeat,
  people,
  swaps,
}: {
  lanId: string;
  meId: string;
  mySeat: string;
  /** Other attendees with a seat. */
  people: { id: string; name: string; seat: string }[];
  /** Open requests I'm part of. */
  swaps: SwapView[];
}) {
  const { pending, error, run } = useAction();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const outgoing = swaps.find((s) => s.fromUserId === meId);
  const incoming = swaps.filter((s) => s.toUserId === meId);
  return (
    <div className="space-y-4 text-sm">
      {incoming.map((s) => (
        <div key={s.id} className="rounded-bit border border-bit/40 bg-bit-soft/40 p-3">
          <p>
            <strong>{s.fromName}</strong> ({s.fromSeat}) wants your seat {s.toSeat}.
            {s.note && <span className="block text-muted">&ldquo;{s.note}&rdquo;</span>}
          </p>
          {s.status === "pending" ? (
            <div className="mt-2 flex gap-2">
              <button disabled={pending} className={btnPrimary} onClick={() => run(() => answerSeatSwap(s.id, true))}>
                Swap
              </button>
              <button disabled={pending} className={btnGhost} onClick={() => run(() => answerSeatSwap(s.id, false))}>
                Decline
              </button>
            </div>
          ) : (
            <p className="mt-1 text-muted">You agreed. Waiting for an orga to approve.</p>
          )}
        </div>
      ))}

      {outgoing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-bit bg-raised/60 p-3">
          <span>
            You asked <strong>{outgoing.toName}</strong> to swap {mySeat} ⇄ {outgoing.toSeat}.{" "}
            {outgoing.status === "pending" ? <Pill tone="amber">waiting for them</Pill> : <Pill tone="emerald">waiting for an orga</Pill>}
          </span>
          <button disabled={pending} className={btnGhost} onClick={() => run(() => cancelSeatSwap(outgoing.id))}>
            Cancel
          </button>
        </div>
      ) : people.length === 0 ? (
        <p className="text-muted">Nobody else has a seat yet.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (to) run(async () => {
              await requestSeatSwap(lanId, to, note);
              setTo("");
              setNote("");
            });
          }}
        >
          <p className="text-muted">
            You sit at <strong className="text-fg">{mySeat}</strong>. Ask someone to swap; once they agree, an orga
            approves it.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={to} onChange={(e) => setTo(e.target.value)} className={input} aria-label="Swap with">
              <option value="">Swap with…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.seat} · {p.name}
                </option>
              ))}
            </select>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Why? (optional)"
              className={input}
            />
            <button disabled={pending || !to} className={btnSecondary}>
              Ask
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

/** Orga side: approve or reject swaps; pending ones are shown as waiting. */
export function SeatSwapApprovals({ swaps }: { swaps: SwapView[] }) {
  const { pending, error, run } = useAction();
  return (
    <div className="space-y-2 text-sm">
      <ul className="space-y-2">
        {swaps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-bit bg-raised/60 px-3 py-2">
            <span>
              <strong>{s.fromName}</strong> {s.fromSeat} ⇄ {s.toSeat} <strong>{s.toName}</strong>
              {s.note && <span className="block text-xs text-muted">&ldquo;{s.note}&rdquo;</span>}
            </span>
            {s.status === "accepted" ? (
              <span className="flex gap-2">
                <button disabled={pending} className={btnPrimary} onClick={() => run(() => decideSeatSwap(s.id, true))}>
                  Approve
                </button>
                <button disabled={pending} className={btnGhost} onClick={() => run(() => decideSeatSwap(s.id, false))}>
                  Reject
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Pill tone="amber">waiting for {s.toName}</Pill>
                <button disabled={pending} className={btnGhost} onClick={() => run(() => decideSeatSwap(s.id, false))}>
                  Reject
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
