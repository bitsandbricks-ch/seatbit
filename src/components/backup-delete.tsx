"use client";

import { useState, useTransition } from "react";
import { removeBackup } from "@/app/admin/backups/actions";
import { useT } from "@/i18n/client";
import { btnGhost } from "./ui";

/** Deletes one backup after a confirm. */
export function DeleteBackupButton({ name }: { name: string }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        className={`${btnGhost} text-danger`}
        onClick={() =>
          confirm(t("backups.deleteQ", { name })) &&
          start(async () => {
            const r = await removeBackup(name);
            setError(r && !r.ok ? r.message : null);
          })
        }
      >
        {pending ? t("settingsUi.working") : t("backups.delete")}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
