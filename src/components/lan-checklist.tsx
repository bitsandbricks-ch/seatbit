"use client";
import type { ChecklistStep } from "@/lib/checklist";
import { TicketConfirm } from "./ticket-confirm";

export function LanChecklist({
  lanId,
  steps,
  ticketBought,
  canReportTicket,
  variant = "list",
}: {
  lanId: string;
  steps: ChecklistStep[];
  ticketBought: boolean;
  canReportTicket: boolean;
  /** list: stacked (sidebar). strip: compact row above the event tabs, shown on every tab. */
  variant?: "list" | "strip";
}) {
  const done = steps.filter((s) => s.state === "done").length;
  if (variant === "strip") return <ChecklistStrip lanId={lanId} steps={steps} done={done} ticketBought={ticketBought} canReportTicket={canReportTicket} />;
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
                <div className="mt-2">
                  <TicketConfirm lanId={lanId} bought={ticketBought} confirmed={false} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepIcon({ s, i }: { s: ChecklistStep; i: number }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
        s.state === "done" ? "bg-bit text-on-bit" : s.state === "pending" ? "bg-warn text-on-bit" : "border border-line text-muted"
      }`}
    >
      {s.state === "done" ? "✓" : s.state === "pending" ? "…" : i + 1}
    </span>
  );
}

function ChecklistStrip({
  lanId,
  steps,
  done,
  ticketBought,
  canReportTicket,
}: {
  lanId: string;
  steps: ChecklistStep[];
  done: number;
  ticketBought: boolean;
  canReportTicket: boolean;
}) {
  const all = done === steps.length;
  return (
    <section aria-label="Your checklist" className="rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">Your checklist</h2>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-bit transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <span className={`text-sm ${all ? "font-medium text-bit" : "text-muted"}`}>{all ? "All set" : `${done} / ${steps.length}`}</span>
      </div>
      <ol className={`grid grid-cols-2 gap-x-4 gap-y-3 ${steps.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-2.5">
            <StepIcon s={s} i={i} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-6 ${s.state === "done" ? "text-muted" : "text-fg"}`}>{s.title}</p>
              {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
              {s.key === "ticket" && s.state !== "done" && canReportTicket && (
                <div className="mt-2">
                  <TicketConfirm lanId={lanId} bought={ticketBought} confirmed={false} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
