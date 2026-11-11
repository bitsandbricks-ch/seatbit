"use client";
import { useTransition } from "react";
import { setMyTicketBought } from "@/app/actions";
import type { ChecklistStep } from "@/lib/checklist";
import { btnSecondary, btnGhost } from "./ui";

export function LanChecklist({
  lanId,
  steps,
  ticketBought,
  canReportTicket,
}: {
  lanId: string;
  steps: ChecklistStep[];
  ticketBought: boolean;
  canReportTicket: boolean;
}) {
  const [pending, start] = useTransition();
  const done = steps.filter((s) => s.state === "done").length;
  return (
    <div className="space-y-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-bit transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === "done"
                  ? "bg-bit text-ink"
                  : s.state === "pending"
                    ? "bg-amber-400 text-ink"
                    : "border border-zinc-600 text-zinc-400"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "pending" ? "…" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.state === "done" ? "text-zinc-400" : "text-zinc-100"}`}>
                {s.title}
              </p>
              {s.hint && <p className="text-xs text-zinc-500">{s.hint}</p>}
              {s.key === "ticket" && s.state !== "done" && canReportTicket && (
                <button
                  disabled={pending}
                  onClick={() => start(() => setMyTicketBought(lanId, !ticketBought))}
                  className={`${ticketBought ? btnGhost : btnSecondary} mt-1.5 !py-1 text-xs`}
                >
                  {ticketBought ? "Undo: I haven't bought it" : "I bought my ticket"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
