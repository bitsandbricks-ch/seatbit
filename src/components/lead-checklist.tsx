import Link from "next/link";
import type { LeadStep } from "@/lib/lead-checklist";

/** The leads' to-do list on Manage → Overview; each open step links to where it's done. */
export function LeadChecklist({ steps }: { steps: LeadStep[] }) {
  const done = steps.filter((s) => s.state === "done").length;
  const all = done === steps.length;
  return (
    <section aria-label="Lead checklist" className="rounded-card border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-fg">Lead checklist</h2>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
          <div className="h-full bg-bit transition-all" style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} />
        </div>
        <span className={`text-sm ${all ? "font-medium text-bit" : "text-muted"}`}>{all ? "All set" : `${done} / ${steps.length}`}</span>
      </div>
      <ol className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((s, i) => (
          // Phones: only the open steps, so the list stays short.
          <li key={s.key} className={`${s.state === "done" && !all ? "hidden sm:flex" : "flex"} gap-2.5`}>
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                s.state === "done" ? "bg-bit text-on-bit" : s.state === "pending" ? "bg-warn text-on-bit" : "border border-line text-muted"
              }`}
            >
              {s.state === "done" ? "✓" : s.state === "pending" ? "…" : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              {s.href && s.state !== "done" ? (
                <Link href={s.href} scroll={false} className="text-sm font-medium leading-6 text-fg hover:text-bit">
                  {s.title} <span className="text-bit" aria-hidden>→</span>
                </Link>
              ) : (
                <p className={`text-sm font-medium leading-6 ${s.state === "done" ? "text-muted" : "text-fg"}`}>{s.title}</p>
              )}
              <p className="text-xs text-muted">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
