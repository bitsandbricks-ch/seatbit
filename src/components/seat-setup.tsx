"use client";
import { useState, useTransition } from "react";
import { adminAutoAssignSeats, setSeatsFromList } from "@/app/actions";
import { btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";

/** Lead tools: enter the seats the event gave the group, and auto-fill them. */
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
  const t = useT();
  const [pending, start] = useTransition();
  const [spec, setSpec] = useState(current);
  const run = useRunAction();
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm text-fg/90" htmlFor="seat-spec">
          {t("seatSetup.label")}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="seat-spec"
            value={spec}
            onChange={(e) => setSpec(e.target.value)}
            placeholder={t("seatSetup.placeholder")}
            className={`${input} min-w-0 flex-1 font-mono`}
          />
          <button
            disabled={pending || !spec.trim()}
            className={btnPrimary}
            onClick={() =>
              start(async () => {
                await run(() => setSeatsFromList(lanId, spec), (r) => t("seatSetup.saved", { count: r.count ?? 0 }));
              })
            }
          >
            {t("seatSetup.save")}
          </button>
        </div>
        <p className="text-xs text-muted">
          {t("seatSetup.hint")}
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            disabled={pending || unseated === 0 || free === 0}
            className={btnSecondary}
            onClick={() =>
              start(async () => {
                await run(() => adminAutoAssignSeats(lanId, "fill"), (n) => t("seatSetup.assigned", { count: n }));
              })
            }
          >
            {t("seatSetup.fill")}
          </button>
          <button
            disabled={pending}
            className={btnSecondary}
            onClick={() => {
              if (!confirm(t("seatSetup.replanConfirm"))) return;
              start(async () => {
                await run(() => adminAutoAssignSeats(lanId, "replan"), (n) => t("seatSetup.planned", { count: n }));
              });
            }}
          >
            {t("seatSetup.replan")}
          </button>
        </div>
        <p className="text-xs text-muted">
          {t("seatSetup.status", { unseated, free })}
        </p>
      </div>
    </div>
  );
}
