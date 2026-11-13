import Link from "next/link";
import { toggleLanTask } from "@/app/lead-task-actions";
import type { LeadTaskView } from "@/lib/lead-tasks";
import { fmtDate, fmtWeekday } from "@/lib/format";
import { getT } from "@/i18n/server";
import { ContactDetails } from "./lead-contacts";
import { TaskAssignee } from "./lead-task-assign";
import { Card, Pill } from "./ui";

/** The event's own lead to-dos (from the clan, the LAN type and the event), ticked off by hand. */
export async function LeadTasks({
  lanId,
  tasks,
  leads,
  names,
  editLinks,
  children,
}: {
  lanId: string;
  tasks: LeadTaskView[];
  leads: { id: string; name: string }[];
  names: Map<string, string>;
  editLinks: { href: string; label: string }[];
  /** The form for this event's own to-dos. */
  children?: React.ReactNode;
}) {
  const t = await getT();
  const done = tasks.filter((x) => x.state === "done").length;
  // Open ones first, then the locked ones, done ones last; the defined order within each.
  const rank = { todo: 0, locked: 1, done: 2 } as const;
  const sorted = [...tasks].sort((a, b) => rank[a.state] - rank[b.state]);
  return (
    <Card
      id="lead-tasks"
      title={t("leadTasks.heading")}
      actions={tasks.length > 0 && <span className={`text-sm ${done === tasks.length ? "font-medium text-bit" : "text-muted"}`}>{`${done} / ${tasks.length}`}</span>}
    >
      <p className="mb-3 text-sm text-muted">{t("leadTasks.hint")}</p>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{t("leadTasks.empty")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((x) => (
            <li key={x.id} className={`flex gap-3 py-3 ${x.state === "locked" ? "opacity-70" : ""}`}>
              <form action={toggleLanTask.bind(null, lanId, x.id)}>
                <button
                  aria-label={t(x.state === "done" ? "leadTasks.untick" : "leadTasks.tick")}
                  title={t(x.state === "done" ? "leadTasks.untick" : "leadTasks.tick")}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    x.state === "done" ? "bg-bit text-on-bit" : "border border-line text-muted hover:border-bit hover:text-bit"
                  }`}
                >
                  {x.state === "done" ? "✓" : x.state === "locked" ? "🔒" : ""}
                </button>
              </form>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={`text-sm font-medium ${x.state === "done" ? "text-muted line-through" : "text-fg"}`}>{x.title}</p>
                  {x.due && x.state !== "done" && (
                    <Pill tone={x.overdue ? "red" : "zinc"}>
                      {t(x.overdue ? "leadTasks.overdue" : "leadTasks.due", { date: fmtWeekday(x.due, t.locale) })}
                    </Pill>
                  )}
                  <span className="text-xs text-faint">{t(`leadTasks.scope.${x.scope}`)}</span>
                </div>
                {x.state === "locked" && <p className="text-xs text-warn">{t("leadTasks.waitingFor", { steps: x.waitingFor.join(", ") })}</p>}
                {x.note && x.state !== "done" && <p className="whitespace-pre-line text-xs text-muted">{x.note}</p>}
                {x.contact && x.state !== "done" && (
                  <div className="rounded-bit bg-raised px-2.5 py-1.5">
                    <ContactDetails c={x.contact} t={t} compact />
                  </div>
                )}
                {x.state === "done" ? (
                  <p className="text-xs text-muted">
                    {t("leadTasks.doneBy", { name: (x.doneById && names.get(x.doneById)) || t("audit.someone"), date: fmtDate(x.doneAt, t.locale) })}
                  </p>
                ) : (
                  <TaskAssignee lanId={lanId} taskId={x.id} value={x.assigneeId} leads={leads} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {children}
      {editLinks.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {editLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-bit hover:underline">
              {l.label}
            </Link>
          ))}
        </p>
      )}
    </Card>
  );
}
