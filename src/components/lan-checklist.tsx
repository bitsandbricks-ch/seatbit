"use client";
import Link from "next/link";
import { progress, type ChecklistStep, type StepKey } from "@/lib/checklist";
import type { ReactNode } from "react";
import { TicketConfirm } from "./ticket-confirm";
import { useT } from "@/i18n/client";

/** Something else worth doing for this event, outside the checklist: a ride to offer, food to order, money to settle. */
export type GuideExtra = { key: string; label: string; href: string; tone?: "warn" | "ok" };

export function LanChecklist({
  lanId,
  steps,
  ticketBought,
  canReportTicket,
  variant = "list",
  answer,
  links = {},
  extras = [],
}: {
  lanId: string;
  steps: ChecklistStep[];
  ticketBought: boolean;
  canReportTicket: boolean;
  /** list: stacked (sidebar). strip: compact row above the event tabs, shown on every tab. */
  variant?: "list" | "strip";
  /** strip only: a compact answer badge next to the title, used once the answer is locked. */
  answer?: ReactNode;
  /** strip only: where an open step gets done, so the checklist takes you there instead of just naming the tab. */
  links?: Partial<Record<StepKey, string>>;
  /** strip only: optional things for this event, shown as chips under the steps (also when all is set). */
  extras?: GuideExtra[];
}) {
  const { done, total } = progress(steps);
  if (variant === "strip")
    return (
      <ChecklistStrip
        lanId={lanId}
        steps={steps}
        done={done}
        total={total}
        ticketBought={ticketBought}
        canReportTicket={canReportTicket}
        answer={answer}
        links={links}
        extras={extras}
      />
    );
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

/** Steps whose work happens somewhere else on the page, so the guide can link there. */
type GoKey = "nick" | "wishes" | "pick" | "games";

function StepIcon({ s, i, next = false }: { s: ChecklistStep; i: number; next?: boolean }) {
  return (
    <span
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
        s.state === "done"
          ? "bg-bit text-on-bit"
          : s.state === "pending"
            ? "bg-warn text-on-bit"
            : next
              ? "border-2 border-bit text-bit"
              : "border border-line text-muted"
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
  links,
  extras,
}: {
  lanId: string;
  steps: ChecklistStep[];
  answer?: ReactNode;
  links: Partial<Record<StepKey, string>>;
  extras: GuideExtra[];
  done: number;
  total: number;
  ticketBought: boolean;
  canReportTicket: boolean;
}) {
  const t = useT();
  // Open optional steps don't hold back "All set".
  const all = done === total;
  // The guide's "next": the first required step you can act on now (not one waiting on the leads).
  const next = all ? undefined : steps.find((s) => s.state === "todo" && !s.optional)?.key;
  const head = (
    <div className="flex items-center gap-3">
      <h2 className="text-sm font-semibold text-fg">{t("checklist.title")}</h2>
      {answer}
      {/* All set: no full bar, so long words (German) keep their room on a phone. */}
      {all ? (
        <span className="flex-1" />
      ) : (
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-bit transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </div>
      )}
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
          <StepIcon s={s} i={i} next={s.key === next} />
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium leading-6 ${s.state === "done" ? "text-muted" : "text-fg"}`}>
              {s.title}
              <OptionalTag s={s} />
              {s.key === next && <span className="ml-1.5 rounded-full bg-bit-soft px-1.5 py-px text-[11px] font-medium text-bit">{t("eventGuide.next")}</span>}
            </p>
            {s.hint && <p className="text-xs text-muted">{s.hint}</p>}
            {s.state !== "done" && (s.key === next || s.optional) && links[s.key] && (
              <Link
                href={links[s.key]!}
                // Links to another tab keep your place, like the tabs do; a #anchor scrolls to its form.
                scroll={links[s.key]!.includes("#")}
                className={`mt-2 inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition ${
                  s.key === next ? "bg-bit text-on-bit hover:brightness-110" : "border border-line text-bit hover:bg-raised"
                }`}
              >
                {t(`eventGuide.go.${s.key as GoKey}`)} <span aria-hidden>→</span>
              </Link>
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
  );
  const chips = extras.length > 0 && (
    <div className="mt-3 border-t border-line pt-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t("eventGuide.also")}</h3>
      <ul className="flex flex-wrap gap-2">
        {extras.map((x) => (
          <li key={x.key}>
            <Link
              href={x.href}
              scroll={false}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition hover:bg-raised ${
                x.tone === "warn" ? "border-warn/40 text-warn" : x.tone === "ok" ? "border-bit/40 text-bit" : "border-line text-fg"
              }`}
            >
              {x.label} <span aria-hidden className="text-muted">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
  const box = "rounded-card border border-line bg-surface p-3 sm:p-4";
  // All done: one line that opens on tap, so a finished checklist doesn't push the tabs down. The extras stay visible.
  return all ? (
    <section aria-label={t("checklist.title")} className={box}>
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{head}</summary>
        {list}
      </details>
      {chips}
    </section>
  ) : (
    <section aria-label={t("checklist.title")} className={box}>
      {head}
      {list}
      {chips}
    </section>
  );
}
