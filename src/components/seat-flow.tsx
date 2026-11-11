"use client";
import { useState, useTransition } from "react";
import { publishSeats, setSeatPicking, unpublishSeats } from "@/app/actions";
import { Pill, btnGhost, btnPrimary, btnSecondary } from "./ui";

type StepState = "done" | "active" | "off" | "todo";

/**
 * The orga's seat flow as steps: members send wishes, an optional self-pick
 * phase, then the orgas check the plan and finalize it. Finalizing is always
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
  const [pending, start] = useTransition();
  const [notify, setNotify] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const final = !!finalizedAt;

  const steps: { title: string; state: StepState; body: React.ReactNode }[] = [
    {
      title: "Seat wishes",
      state: final ? "done" : "active",
      body: final ? (
        "Closed when you finalized."
      ) : (
        <>
          Members tell you who they want to sit near and where. {wishes} of {going} coming sent wishes so far.
        </>
      ),
    },
    {
      title: "Members pick their own seat",
      state: final ? (picking ? "done" : "off") : picking ? "active" : "off",
      body: (
        <div className="space-y-2">
          <p>
            {final
              ? "Closed when you finalized."
              : picking
                ? "On: members who are coming and ticked \"I have my ticket\" can take a free seat on the event page. Held seats stay out of reach and you can still move anyone."
                : "Optional. Turn it on to let members take a free seat themselves. You still check and finalize the plan afterwards."}
          </p>
          {!final && (
            <button
              disabled={pending}
              className={picking ? btnSecondary : btnPrimary}
              onClick={() => start(() => setSeatPicking(lanId, !picking))}
            >
              {picking ? "Turn self pick off" : "Turn on self pick"}
            </button>
          )}
        </div>
      ),
    },
    {
      title: "Orgas finalize the plan",
      state: final ? "done" : "todo",
      body: final ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-bit">
            Finalized {finalizedAt}. Members see the plan and changes you make now tell the people who moved.
          </p>
          <button
            disabled={pending}
            className={btnGhost}
            onClick={() => start(() => unpublishSeats(lanId).then(() => setMsg(null)))}
          >
            Reopen
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            Check the seats{picking ? " people picked" : ""}, move anyone you need to, then finalize. This closes {picking ? "self pick and seat wishes" : "seat wishes"} and shows
            everyone the plan.
            {unseated > 0 && <span className="text-warn"> {unseated} people coming still have no seat.</span>}
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="h-4 w-4 accent-bit"
            />
            Tell everyone coming their seat
          </label>
          <button
            disabled={pending}
            className={btnPrimary}
            onClick={() =>
              start(async () => {
                const n = await publishSeats(lanId, notify);
                setMsg(notify ? `Finalized, ${n} member(s) told.` : "Finalized.");
              })
            }
          >
            Finalize seat plan
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
                {i === 1 && !final && <Pill tone={s.state === "active" ? "emerald" : "zinc"}>{picking ? "on" : "optional · off"}</Pill>}
                {i === 2 && final && <Pill tone="emerald">final</Pill>}
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
