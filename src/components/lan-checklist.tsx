"use client";
import { progress, type ChecklistStep } from "@/lib/checklist";
import type { ReactNode } from "react";
import { TicketConfirm } from "./ticket-confirm";
import { useT } from "@/i18n/client";

export function LanChecklist({
  lanId,
  steps,
  ticketBought,
  canReportTicket,
  variant = "list",
  answer,
}: {
  lanId: string;
  steps: ChecklistStep[];
  ticketBought: boolean;
  canReportTicket: boolean;
  /** list: stacked (sidebar). strip: compact row above the event tabs, shown on every tab. */
  variant?: "list" | "strip";
  /** strip only: a compact answer badge next to the title, used once the answer is locked. */
  answer?: ReactNode;
}) {
  const { done, total } = progress(steps);
  if (variant === "strip") return <ChecklistStrip lanId={lanId} steps={steps} done={done} total={total} ticketBought={ticketBought} canReportTicket={canReportTicket} answer={answer} />;
  return (
    <div className="space-y-4">
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-bit transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
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
                <OptionalTag s={s} />
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

function OptionalTag({ s }: { s: ChecklistStep }) {
  const t = useT();
  return s.optional && s.state !== "done" ? <span className="ml-1.5 text-xs font-normal text-faint">{t("checklist.optional")}</span> : null;
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
  total,
  ticketBought,
  canReportTicket,
  answer,
}: {
  lanId: string;
  steps: ChecklistStep[];
  answer?: ReactNode;
  done: number;
  total: number;
  ticketBought: boolean;
  canReportTicket: boolean;
}) {
  const t = useT();
  // Open optional steps don't hold back "All set".
  const all = done === total;
  const head = (
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold text-fg">{t("checklist.title")}</h2>
      {answer}
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
        <div className="h-full bg-bit transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>
      <span className={`text-sm ${all ? "font-medium text-bit" : "text-muted"}`}>{all ? t("checklist.allSet") : `${done} / ${total}`}</span>
      {all && (
        <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden className="shrink-0 text-muted transition group-open:rotate-180">
          <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
        </svg>
      )}
    </div>
  );
  const list = (
    // Desktop: every step in one row (scrolls sideways if the screen is too narrow), never a second row.
    <ol className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-[minmax(7rem,1fr)] lg:gap-x-3 lg:overflow-x-auto">
      {steps.map((s, i) => (
        // Phones: only the steps still open, so the strip stays short above the tabs.
        <li key={s.key} className={`${s.state === "done" && !all ? "hidden sm:flex" : "flex"} gap-2.5`}>
          <StepIcon s={s} i={i} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium leading-6 ${s.state === "done" ? "text-muted" : "text-fg"}`}>
              {s.title}
              <OptionalTag s={s} />
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
  );
  const box = "rounded-card border border-line bg-surface p-3 sm:p-4";
  // All done: one line that opens on tap, so a finished checklist doesn't push the tabs down.
  return all ? (
    <details aria-label={t("checklist.title")} className={`group ${box}`}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head}</summary>
      {list}
    </details>
  ) : (
    <section aria-label={t("checklist.title")} className={box}>
      {head}
      {list}
    </section>
  );
}
