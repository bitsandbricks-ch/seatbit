"use client";
import { useActionState, useEffect, useState } from "react";
import { deleteLeadTask, saveLeadTask } from "@/app/lead-task-actions";
import type { FormState } from "@/app/actions";
import { LEAD_STEP_DEPS } from "@/lib/lead-checklist";
import { useT } from "@/i18n/client";
import type { T } from "@/i18n/translate";
import { Field, Input, btnGhost, btnPrimary, btnSecondary, input, label } from "./ui";

export type EditableTask = {
  id: string;
  title: string;
  note: string;
  after: string[];
  dueDays: number | null;
  contactId: string | null;
};

type Props = {
  /** Where new to-dos go: the clan's list for all LAN types, one LAN type, or one event. */
  scope: { clanId?: string; typeId?: string; lanId?: string };
  tasks: EditableTask[];
  /** To-dos a to-do here may wait for (this list and the ones above it). */
  depTasks: { id: string; title: string }[];
  contacts: { id: string; name: string }[];
};

export function dueLabel(t: T, d: number | null) {
  if (d == null) return null;
  if (d === 0) return t("leadTasks.dueStart");
  return d > 0 ? t("leadTasks.dueBefore", { count: d }) : t("leadTasks.dueAfter", { count: -d });
}

/** Lists the to-dos of one level with edit and delete, plus a form to add one. */
export function LeadTaskEditor({ scope, tasks, depTasks, contacts }: Props) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(0);
  const titles = new Map(depTasks.map((d) => [d.id, d.title]));
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const depLabel = (d: string) =>
    d.startsWith("task:") ? titles.get(d.slice(5)) ?? null : (LEAD_STEP_DEPS as readonly string[]).includes(d) ? t(`leadSteps.${d as (typeof LEAD_STEP_DEPS)[number]}`) : null;

  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <p className="text-sm text-muted">{t("leadTasks.none")}</p>
      ) : (
        <ul className="divide-y divide-line">
          {tasks.map((x) =>
            editing === x.id ? (
              <li key={x.id} className="py-3">
                <TaskForm
                  scope={scope}
                  task={x}
                  depTasks={depTasks.filter((d) => d.id !== x.id)}
                  contacts={contacts}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={x.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{x.title}</p>
                  <p className="text-xs text-muted">
                    {[
                      x.after.length > 0 &&
                        t("leadTasks.waitingFor", { steps: x.after.map(depLabel).filter(Boolean).join(", ") }),
                      dueLabel(t, x.dueDays),
                      x.contactId && contactName.get(x.contactId),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="flex gap-1">
                  <button type="button" className={btnGhost} onClick={() => setEditing(x.id)}>
                    {t("leadTasks.form.edit")}
                  </button>
                  <form action={deleteLeadTask.bind(null, x.id)}>
                    <button className={`${btnGhost} text-danger`}>{t("leadTasks.form.delete")}</button>
                  </form>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      <details className="rounded-card border border-line p-3" key={adding}>
        <summary className="cursor-pointer text-sm font-medium text-bit">{t("leadTasks.form.add")}</summary>
        <div className="mt-3">
          <TaskForm scope={scope} depTasks={depTasks} contacts={contacts} onDone={() => setAdding((n) => n + 1)} />
        </div>
      </details>
    </div>
  );
}

function TaskForm({
  scope,
  task,
  depTasks,
  contacts,
  onDone,
}: Omit<Props, "tasks"> & { task?: EditableTask; onDone: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveLeadTask, undefined);
  useEffect(() => {
    if (state?.ok) onDone();
    // Only react to a new result, not to a new onDone function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const after = new Set(task?.after ?? []);
  return (
    <form action={action} className="space-y-4">
      {task && <input type="hidden" name="id" value={task.id} />}
      {scope.clanId && <input type="hidden" name="clanId" value={scope.clanId} />}
      {scope.typeId && <input type="hidden" name="typeId" value={scope.typeId} />}
      {scope.lanId && <input type="hidden" name="lanId" value={scope.lanId} />}
      <Field label={t("leadTasks.form.title")}>
        <Input name="title" defaultValue={task?.title} required maxLength={200} placeholder={t("leadTasks.form.titlePlaceholder")} />
      </Field>
      <Field label={t("leadTasks.form.note")} hint={t("leadTasks.form.noteHint")}>
        <textarea name="note" defaultValue={task?.note} rows={2} maxLength={2000} className={input} />
      </Field>
      <fieldset>
        <legend className={label}>{t("leadTasks.form.after")}</legend>
        <p className="mb-2 text-xs text-muted">{t("leadTasks.form.afterHint")}</p>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
          {LEAD_STEP_DEPS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="after" value={d} defaultChecked={after.has(d)} className="accent-bit" />
              {t(`leadSteps.${d}`)}
            </label>
          ))}
          {depTasks.map((d) => (
            <label key={d.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="after" value={`task:${d.id}`} defaultChecked={after.has(`task:${d.id}`)} className="accent-bit" />
              <span className="min-w-0 truncate">{d.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("leadTasks.form.dueDays")} hint={t("leadTasks.form.dueDaysHint")}>
          <Input type="number" name="dueDays" min={-365} max={365} defaultValue={task?.dueDays ?? ""} />
        </Field>
        {contacts.length > 0 && (
          <Field label={t("leadTasks.form.contact")}>
            <select name="contactId" defaultValue={task?.contactId ?? ""} className={input}>
              <option value="">{t("leadTasks.form.noContact")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {task ? t("leadTasks.form.save") : t("leadTasks.form.add")}
        </button>
        {task && (
          <button type="button" className={btnSecondary} onClick={onDone}>
            {t("leadTasks.form.cancel")}
          </button>
        )}
      </div>
    </form>
  );
}
