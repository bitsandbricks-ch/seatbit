"use client";
import { useTransition } from "react";
import { adminSendReminder } from "@/app/actions";
import { btnSecondary } from "./ui";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { ask } from "./dialog";

export function ReminderButtons({
  lanId,
  counts,
  draft = false,
}: {
  lanId: string;
  counts: { signup: number | null; payment: number | null; event: number };
  /** Drafts send nothing, so the buttons wait for publishing. */
  draft?: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  const send = async (kind: "signup" | "payment" | "event", n: number) => {
    const what = t(`manage.reminderKind.${kind}`);
    if (!(await ask({ title: t("reminderButtons.confirm", { what, count: n }), confirm: t("dialog.send") }))) return;
    start(async () => {
      await act(() => adminSendReminder(lanId, kind), (sent) => t("reminderButtons.sent", { what, count: sent }));
    });
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-full text-sm text-muted sm:w-auto">{t("reminderButtons.now")}</span>
        {counts.signup !== null && (
          <button disabled={draft || pending || !counts.signup} className={btnSecondary} onClick={() => send("signup", counts.signup!)}>
            {t("reminderButtons.signup", { count: counts.signup })}
          </button>
        )}
        {counts.payment !== null && (
          <button disabled={draft || pending || !counts.payment} className={btnSecondary} onClick={() => send("payment", counts.payment!)}>
            {t("reminderButtons.payment", { count: counts.payment })}
          </button>
        )}
        <button disabled={draft || pending || !counts.event} className={btnSecondary} onClick={() => send("event", counts.event)}>
          {t("reminderButtons.event", { count: counts.event })}
        </button>
      </div>
      {draft && <p className="text-sm text-muted">{t("reminderButtons.draft")}</p>}
    </div>
  );
}
