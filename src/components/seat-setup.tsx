"use client";
import { useState, useTransition } from "react";
import { adminAutoAssignSeats, setSeatsFromList } from "@/app/actions";
import { btnPrimary, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";

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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
                const r = await setSeatsFromList(lanId, spec);
                setMsg(r.error ? { ok: false, text: r.error } : { ok: true, text: t("seatSetup.saved", { count: r.count ?? 0 }) });
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
                const n = await adminAutoAssignSeats(lanId, "fill");
                setMsg({ ok: true, text: t("seatSetup.assigned", { count: n }) });
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
                const n = await adminAutoAssignSeats(lanId, "replan");
                setMsg({ ok: true, text: t("seatSetup.planned", { count: n }) });
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
      {msg && <p className={`text-sm ${msg.ok ? "text-bit" : "text-danger"}`}>{msg.text}</p>}
    </div>
  );
}
