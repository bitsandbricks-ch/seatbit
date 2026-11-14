"use client";
import { useState, useTransition } from "react";
import { adminAutoAssignSeats, setSeatsFromList } from "@/app/actions";
import { setSeatAutoPlan, setSeatNearRange } from "@/app/seat-plan-actions";
import { MAX_NEAR_RANGE, MIN_NEAR_RANGE } from "@/lib/seat-rules";
import { btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";

/** Lead tools: enter the seats the event gave the group, and auto-fill them. */
export function SeatSetup({
  lanId,
  current,
  unseated,
  free,
  autoPlan,
  autoPlanBlocked,
  nearRange,
}: {
  lanId: string;
  current: string;
  unseated: number;
  free: number;
  /** Re-plan whenever someone changes their wishes. */
  autoPlan: boolean;
  /** Why auto re-planning can't run right now (final plan, self pick), or null. */
  autoPlanBlocked: string | null;
  /** Seats apart that count as "near" for seat wishes. */
  nearRange: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [spec, setSpec] = useState(current);
  const [auto, setAuto] = useState(autoPlan);
  const [range, setRange] = useState(String(nearRange));
  const [savedRange, setSavedRange] = useState(nearRange);
  const saveRange = () => {
    const n = Number(range);
    if (!range.trim() || !Number.isFinite(n) || n === savedRange) return setRange(String(savedRange));
    start(async () => {
      const ok = await run(
        async () => {
          const r = await setSeatNearRange(lanId, n);
          setRange(String(r));
          setSavedRange(r);
          return r;
        },
        (r) => t("wishLead.nearRangeSaved", { range: r }),
      );
      if (!ok) setRange(String(savedRange));
    });
  };
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
        <label className="flex items-start gap-2.5 rounded-md border border-line bg-raised/50 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-bit"
            checked={auto}
            disabled={pending}
            onChange={(e) => {
              const on = e.target.checked;
              setAuto(on);
              start(async () => {
                const ok = await run(() => setSeatAutoPlan(lanId, on), on ? t("seatSetup.autoOnSaved") : t("seatSetup.autoOffSaved"));
                if (!ok) setAuto(!on);
              });
            }}
          />
          <span>
            <span className="block text-fg">{t("seatSetup.auto")}</span>
            <span className="block text-xs text-muted">{autoPlanBlocked ?? t("seatSetup.autoHint")}</span>
          </span>
        </label>
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault();
            saveRange();
          }}
        >
          <label className="flex flex-wrap items-center gap-2 text-sm text-fg/90">
            {t("wishLead.nearRange")}
            <input
              type="number"
              inputMode="numeric"
              min={MIN_NEAR_RANGE}
              max={MAX_NEAR_RANGE}
              value={range}
              disabled={pending}
              onChange={(e) => setRange(e.target.value)}
              onBlur={saveRange}
              className={`${input} w-20 tabular-nums`}
            />
            {t("wishLead.nearRangeUnit")}
          </label>
          <p className="text-xs text-muted">{t("wishLead.nearRangeHint")}</p>
        </form>
      </div>
    </div>
  );
}
