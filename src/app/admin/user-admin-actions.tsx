import { setPlatformRole, suspendUserAction, unsuspendUserAction } from "@/app/moderation-actions";
import { ActionForm } from "@/components/action-form";
import { btnDanger, btnGhost, input } from "@/components/ui";
import type { T } from "@/i18n/translate";
import { assignableRoles, canSetRole, outranks, platformCan } from "@/lib/platform-roles";

type Target = { id: string; role: string; isGuest: boolean; suspendedAt: Date | null };

/**
 * Platform role picker and suspend/restore for one user, as far as the viewer may.
 * Shared by the users list on the admin overview and the user's admin page.
 */
export function UserAdminActions({ t, me, u, name }: { t: T; me: { id: string; role: string }; u: Target; name: string }) {
  if (u.isGuest || u.id === me.id) return null;
  const setRole = canSetRole(me, u);
  const suspend = platformCan(me, "suspend") && outranks(me, u);
  if (!setRole && !suspend) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {setRole && (
        <ActionForm action={setPlatformRole.bind(null, u.id)} auto="toggles" className="flex items-center gap-1">
          <select
            name="role"
            defaultValue={u.role}
            aria-label={t("platformRoles.roleOf", { name })}
            className={`${input} !w-auto !py-1.5 text-sm`}
          >
            {assignableRoles(me).map((r) => (
              <option key={r} value={r}>
                {t(`platformRoles.name.${r}`)}
              </option>
            ))}
          </select>
        </ActionForm>
      )}
      {suspend &&
        (u.suspendedAt ? (
          <ActionForm action={unsuspendUserAction.bind(null, u.id)}>
            <button className={btnGhost}>{t("moderation.restore")}</button>
          </ActionForm>
        ) : (
          <SuspendForm t={t} action={suspendUserAction.bind(null, u.id)} label={t("moderation.suspendUser", { name })} />
        ))}
    </span>
  );
}

/** "Suspend" that opens a reason field first, so nobody suspends by a stray tap. */
export function SuspendForm({ t, action, label }: { t: T; action: (form: FormData) => Promise<void>; label: string }) {
  return (
    <details className="group">
      <summary className={`${btnGhost} cursor-pointer list-none !text-danger`}>{t("moderation.suspend")}</summary>
      <ActionForm action={action} className="mt-2 w-64 max-w-full space-y-2 rounded-card border border-line bg-surface p-3 text-left text-sm">
        <p className="font-medium">{label}</p>
        <input name="reason" className={input} placeholder={t("moderation.reasonPlaceholder")} aria-label={t("moderation.reasonPlaceholder")} maxLength={500} />
        <button className={btnDanger}>{t("moderation.suspend")}</button>
      </ActionForm>
    </details>
  );
}
