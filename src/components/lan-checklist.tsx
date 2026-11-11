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
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-bit transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === "done"
                  ? "bg-bit text-on-bit"
                  : s.state === "pending"
                    ? "bg-warn text-on-bit"
                    : "border border-line text-muted"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "pending" ? "…" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.state === "done" ? "text-muted" : "text-fg"}`}>
                {s.title}
              </p>
              {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
              {s.key === "ticket" && s.state !== "done" && canReportTicket && (
                <button
                  disabled={pending}
                  onClick={() => start(() => setMyTicketBought(lanId, !ticketBought))}
                  className={`${ticketBought ? btnGhost : btnSecondary} mt-2`}
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
