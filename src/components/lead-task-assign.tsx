"use client";
import { useTransition } from "react";
import { assignLanTask } from "@/app/lead-task-actions";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";

/** Who has a to-do at this event; saves on change. */
export function TaskAssignee({
  lanId,
  taskId,
  value,
  leads,
}: {
  lanId: string;
  taskId: string;
  value: string | null;
  leads: { id: string; name: string }[];
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <select
      aria-label={t("leadTasks.assignee")}
      value={value ?? ""}
      disabled={pending}
      onChange={(e) => start(async () => void (await act(() => assignLanTask(lanId, taskId, e.target.value))))}
      className="max-w-[12rem] rounded-bit border border-line bg-raised px-2 py-1 text-xs text-fg"
    >
      <option value="">{t("leadTasks.nobody")}</option>
      {leads.map((l) => (
        <option key={l.id} value={l.id}>
          {l.name}
        </option>
      ))}
    </select>
  );
}
