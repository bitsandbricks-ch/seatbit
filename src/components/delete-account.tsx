"use client";
import { useActionState, useState } from "react";
import { deleteMyAccount, type DeleteState } from "@/app/account-actions";
import { btnDanger, btnGhost, btnSecondary, input } from "./ui";
import { useT } from "@/i18n/client";

/**
 * "Your data" on the profile: download everything as JSON, and delete the account. Deleting
 * opens a short confirmation that says what goes and what stays, and needs DELETE typed in.
 */
export function YourData({
  blockingClans,
  clansToDelete,
  lastPlatformAdmin,
  upcomingEvents,
}: {
  blockingClans: { name: string; slug: string }[];
  clansToDelete: string[];
  lastPlatformAdmin: boolean;
  upcomingEvents: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteMyAccount, undefined);
  const blocked = blockingClans.length > 0 || lastPlatformAdmin;

  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-muted">{t("profile.data.exportText")}</p>
        <a href="/profile/export" className={`${btnSecondary} w-full`} download>
          {t("profile.data.download")}
        </a>
      </div>
      <div className="space-y-2 border-t border-line pt-4">
        {!open ? (
          <>
            <p className="text-muted">{t("profile.data.deleteText")}</p>
            <button type="button" className={`${btnGhost} w-full !text-danger`} onClick={() => setOpen(true)}>
              {t("profile.data.deleteOpen")}
            </button>
          </>
        ) : (
          <form action={action} className="space-y-3">
            <p className="font-medium text-fg">{t("profile.data.confirmTitle")}</p>
            {blocked ? (
              <div className="space-y-2 rounded-md border border-warn/30 bg-warn/10 p-3 text-warn">
                {blockingClans.length > 0 && (
                  <p>
                    {t.rich("profile.data.onlyAdmin", { clans: blockingClans.map((c, i) => (
                      <span key={c.slug}>
                        {i > 0 && ", "}
                        <a href={`/clans/${c.slug}/settings?tab=members`} className="underline">
                          {c.name}
                        </a>
                      </span>
                    )) })}
                  </p>
                )}
                {lastPlatformAdmin && <p>{t("profile.data.onlyPlatformAdmin")}</p>}
              </div>
            ) : (
              <>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  <li>{t("profile.data.goes")}</li>
                  <li>
                    {t("profile.data.leaveClans")}
                    {upcomingEvents > 0 && ` ${t("profile.data.upcoming", { count: upcomingEvents })}`}
                  </li>
                  <li>{t("profile.data.pastEvents")}</li>
                  {clansToDelete.length > 0 && (
                    <li className="text-danger">
                      {t("profile.data.clansDeleted", { count: clansToDelete.length, clans: clansToDelete.join(", ") })}
                    </li>
                  )}
                </ul>
                <label className="block">
                  <span className="mb-1 block text-xs text-muted">{t("profile.data.typeDelete")}</span>
                  <input
                    name="confirm"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    className={input}
                    placeholder="DELETE"
                  />
                </label>
              </>
            )}
            {state?.error && <p className="text-danger">{state.error}</p>}
            <div className="flex flex-wrap gap-2">
              {!blocked && (
                <button className={btnDanger} disabled={pending || typed.trim().toUpperCase() !== "DELETE"}>
                  {pending ? t("profile.data.deleting") : t("profile.data.delete")}
                </button>
              )}
              <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
