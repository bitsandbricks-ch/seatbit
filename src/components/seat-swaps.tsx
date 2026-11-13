"use client";
import { useState, useTransition } from "react";
import { answerSeatSwap, cancelSeatSwap, decideSeatSwap, requestSeatSwap } from "@/app/lan-extras-actions";
import { Pill, btnGhost, btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";

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
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("eventUi.failed"));
      }
    });
  return { pending, error, run, t };
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
  const { pending, error, run, t } = useAction();
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const outgoing = swaps.find((s) => s.fromUserId === meId);
  const incoming = swaps.filter((s) => s.toUserId === meId);
  return (
    <div className="space-y-4 text-sm">
      {incoming.map((s) => (
        <div key={s.id} className="rounded-bit border border-bit/40 bg-bit-soft/40 p-3">
          <p>
            {t.rich("swaps.wants", { name: <strong>{s.fromName}</strong>, from: s.fromSeat, to: s.toSeat })}
            {s.note && <span className="block text-muted">&ldquo;{s.note}&rdquo;</span>}
          </p>
          {s.status === "pending" ? (
            <div className="mt-2 flex gap-2">
              <button disabled={pending} className={btnPrimary} onClick={() => run(() => answerSeatSwap(s.id, true))}>
                {t("swaps.swap")}
              </button>
              <button disabled={pending} className={btnGhost} onClick={() => run(() => answerSeatSwap(s.id, false))}>
                {t("swaps.decline")}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-muted">{t("swaps.agreed")}</p>
          )}
        </div>
      ))}

      {outgoing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-bit bg-raised/60 p-3">
          <span>
            {t.rich("swaps.asked", { name: <strong>{outgoing.toName}</strong>, mine: mySeat, theirs: outgoing.toSeat })}{" "}
            {outgoing.status === "pending" ? <Pill tone="amber">{t("swaps.waitingThem")}</Pill> : <Pill tone="emerald">{t("swaps.waitingLead")}</Pill>}
          </span>
          <button disabled={pending} className={btnGhost} onClick={() => run(() => cancelSeatSwap(outgoing.id))}>
            {t("common.cancel")}
          </button>
        </div>
      ) : people.length === 0 ? (
        <p className="text-muted">{t("swaps.nobody")}</p>
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
            {t.rich("swaps.intro", { seat: <strong className="text-fg">{mySeat}</strong> })}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={to} onChange={(e) => setTo(e.target.value)} className={input} aria-label={t("swaps.with")}>
              <option value="">{t("swaps.withPick")}</option>
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
              placeholder={t("swaps.why")}
              className={input}
            />
            <button disabled={pending || !to} className={btnSecondary}>
              {t("swaps.ask")}
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

/** Lead side: approve or reject swaps; pending ones are shown as waiting. */
export function SeatSwapApprovals({ swaps }: { swaps: SwapView[] }) {
  const { pending, error, run, t } = useAction();
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
                  {t("swaps.approve")}
                </button>
                <button disabled={pending} className={btnGhost} onClick={() => run(() => decideSeatSwap(s.id, false))}>
                  {t("swaps.reject")}
                </button>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Pill tone="amber">{t("swaps.waitingFor", { name: s.toName })}</Pill>
                <button disabled={pending} className={btnGhost} onClick={() => run(() => decideSeatSwap(s.id, false))}>
                  {t("swaps.reject")}
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
