"use client";
import type { ChecklistStep } from "@/lib/checklist";
import { TicketConfirm } from "./ticket-confirm";
import { BookedToggle } from "./seat-booking";
import { useT } from "@/i18n/client";

export function LanChecklist({
  lanId,
  steps,
  ticketBought,
  canReportTicket,
  variant = "list",
  planUrl,
  seatBooked = false,
}: {
  lanId: string;
  steps: ChecklistStep[];
  ticketBought: boolean;
  canReportTicket: boolean;
  /** The event's own seat plan, for the "book your seat" step. */
  planUrl?: string;
  seatBooked?: boolean;
  /** list: stacked (sidebar). strip: compact row above the event tabs, shown on every tab. */
  variant?: "list" | "strip";
}) {
  const done = steps.filter((s) => s.state === "done").length;
  if (variant === "strip") return <ChecklistStrip lanId={lanId} steps={steps} done={done} ticketBought={ticketBought} canReportTicket={canReportTicket} planUrl={planUrl} seatBooked={seatBooked} />;
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
              {s.key === "book" && planUrl && (
                <div className="mt-2">
                  <BookedToggle lanId={lanId} booked={seatBooked} planUrl={planUrl} />
                </div>
              )}
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
  planUrl,
  seatBooked,
}: {
  lanId: string;
  steps: ChecklistStep[];
  done: number;
  ticketBought: boolean;
  canReportTicket: boolean;
  planUrl?: string;
  seatBooked: boolean;
}) {
  const t = useT();
  const all = done === steps.length;
  return (
    <section aria-label={t("checklist.title")} className="rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">{t("checklist.title")}</h2>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-bit transition-all" style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
        <span className={`text-sm ${all ? "font-medium text-bit" : "text-muted"}`}>{all ? t("checklist.allSet") : `${done} / ${steps.length}`}</span>
      </div>
      <ol className={`grid gap-x-4 gap-y-3 sm:grid-cols-2 ${steps.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {steps.map((s, i) => (
          // Phones: only the steps still open, so the strip stays short above the tabs.
          <li key={s.key} className={`${s.state === "done" && !all ? "hidden sm:flex" : "flex"} gap-2.5`}>
            <StepIcon s={s} i={i} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-6 ${s.state === "done" ? "text-muted" : "text-fg"}`}>{s.title}</p>
              {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
              {s.key === "book" && planUrl && (
                <div className="mt-2">
                  <BookedToggle lanId={lanId} booked={seatBooked} planUrl={planUrl} />
                </div>
              )}
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
