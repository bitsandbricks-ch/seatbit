"use client";

import { useTransition } from "react";
import { removeBackup } from "@/app/admin/backups/actions";
import { useT } from "@/i18n/client";
import { useRunAction } from "./action-form";
import { btnGhost } from "./ui";
import { ask } from "./dialog";

/** Deletes one backup after a confirm. */
export function DeleteBackupButton({ name }: { name: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const act = useRunAction();
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${btnGhost} text-danger`}
        onClick={async () =>
          (await ask({ title: t("backups.deleteQ", { name }), body: t("dialog.cantUndo"), confirm: t("dialog.delete"), danger: true })) &&
          start(async () => void (await act(() => removeBackup(name))))
        }
      >
        {pending ? t("settingsUi.working") : t("backups.delete")}
      </button>
    </>
  );
}
