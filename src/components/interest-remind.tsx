"use client";
import { useTransition } from "react";
import { nudgeMissing } from "@/app/lan-extras-actions";
import { btnSecondary } from "./ui";
import { ask } from "./dialog";
import { toast } from "./toast";
import { useRunAction } from "./action-form";
import { useT } from "@/i18n/client";

/** Leads remind everyone who hasn't answered the interest check (same nudge as on the Lead page). */
export function InterestRemind({ lanId, count }: { lanId: string; count: number }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <button
      disabled={pending}
      className={`${btnSecondary} !min-h-8 !px-2.5 text-xs`}
      onClick={async () => {
        if (!(await ask({ title: t("interestList.remindQ", { count }), body: t("interestList.remindBody"), confirm: t("interestList.remindYes") })))
          return;
        start(async () => {
          let r: Awaited<ReturnType<typeof nudgeMissing>> | undefined;
          await act(async () => void (r = await nudgeMissing(lanId, "interest")), false);
          if (!r) return;
          const parts = [t("missing.nudged", { count: r.sent })];
          if (r.skipped) parts.push(t("missing.skipped", { count: r.skipped }));
          if (r.unreachable) parts.push(t("missing.unreachable", { count: r.unreachable }));
          (r.sent ? toast.success : toast.error)(parts.join(" · "));
        });
      }}
    >
      {t("interestList.remind")}
    </button>
  );
}
