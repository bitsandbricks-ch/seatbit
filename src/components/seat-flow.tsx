"use client";
import { useState, useTransition } from "react";
import { publishSeats, setSeatPicking, unpublishSeats } from "@/app/actions";
import { Pill, btnGhost, btnPrimary, btnSecondary } from "./ui";
import { useT } from "@/i18n/client";

type StepState = "done" | "active" | "off" | "todo";

/**
 * The lead's seat flow as steps: members send wishes, an optional self-pick
 * phase, then the leads check the plan and finalize it. Finalizing is always
 * the last step, also when members picked their own seats: it closes self pick
 * and wishes, shows everyone the plan and (optionally) tells them their seat.
 * In the database "finalized" is `seatsPublishedAt`.
 */
export function SeatFlow({
  lanId,
  finalizedAt,
  picking,
  going,
  unseated,
  wishes,
}: {
  lanId: string;
  finalizedAt: string | null;
  picking: boolean;
  going: number;
  unseated: number;
  /** People coming who sent at least one seat wish. */
  wishes: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const final = !!finalizedAt;

  const steps: { title: string; state: StepState; body: React.ReactNode }[] = [
    {
      title: t("cmd.seatWishes"),
      state: final ? "done" : "active",
      body: final ? t("seatFlow.closed") : t("seatFlow.wishesHint", { wishes, count: going }),
    },
    {
      title: t("seatFlow.pick"),
      state: final ? (picking ? "done" : "off") : picking ? "active" : "off",
      body: (
        <div className="space-y-2">
          <p>
            {final ? t("seatFlow.closed") : picking ? t("seatFlow.pickOn") : t("seatFlow.pickOff")}
          </p>
          {!final && (
            <button
              disabled={pending}
              className={picking ? btnSecondary : btnPrimary}
              onClick={() => start(() => setSeatPicking(lanId, !picking))}
            >
              {picking ? t("seatFlow.turnOff") : t("seatFlow.turnOn")}
            </button>
          )}
        </div>
      ),
    },
    {
      title: t("seatFlow.finalize"),
      state: final ? "done" : "todo",
      body: final ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-bit">{t("seatFlow.finalized", { date: finalizedAt ?? "" })}</p>
          <button
            disabled={pending}
            className={btnGhost}
            onClick={() => start(() => unpublishSeats(lanId).then(() => setMsg(null)))}
          >
            {t("seatFlow.reopen")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            {t(picking ? "seatFlow.checkPicked" : "seatFlow.check")}
            {unseated > 0 && <span className="text-warn"> {t("seatFlow.unseated", { count: unseated })}</span>}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4 accent-bit"
            />
            {t("seatFlow.tellEveryone")}
          </label>
          <button
            disabled={pending}
            className={btnPrimary}
            onClick={() =>
              start(async () => {
                const n = await publishSeats(lanId, notify);
                setMsg(notify ? t("seatFlow.finalizedTold", { count: n }) : t("seatFlow.finalizedShort"));
              })
            }
          >
            {t("seatFlow.finalizeButton")}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="text-sm">
      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === "done"
                  ? "bg-bit text-on-bit"
                  : s.state === "active"
                    ? "border-2 border-bit text-bit"
                    : "border border-line text-muted"
              }`}
              aria-hidden
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-1 flex flex-wrap items-center gap-2 font-medium text-fg">
                {s.title}
                {i === 1 && !final && <Pill tone={s.state === "active" ? "emerald" : "zinc"}>{picking ? t("seatFlow.on") : t("seatFlow.optionalOff")}</Pill>}
                {i === 2 && final && <Pill tone="emerald">{t("manage.final")}</Pill>}
              </p>
              <div className="text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
      {msg && <p className="mt-3 text-bit">{msg}</p>}
    </div>
  );
}
