"use client";

import { useToastAction } from "./action-form";
import type { ActionResult } from "@/app/admin/settings/actions";
import { DateTimePicker } from "./date-time-picker";
import { btnPrimary, btnSecondary, input, label } from "./ui";
import { useT } from "@/i18n/client";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/** Maintenance banner: message, optional start and end, and a post to the announcements channel. */
export function MaintenanceForm({
  action,
  message,
  startsAt,
  endsAt,
  canAnnounce,
}: {
  action: Action;
  message: string;
  startsAt: string;
  endsAt: string;
  canAnnounce: boolean;
}) {
  const t = useT();
  const [state, formAction, pending] = useToastAction(action, undefined);
  return (
    <form key={state?.at ?? 0} action={formAction} className="space-y-4">
      <div>
        <label className={label} htmlFor="maintenance-message">
          {t("settingDefs.maintenance_message.label")}
        </label>
        <textarea
          id="maintenance-message"
          name="message"
          rows={2}
          maxLength={500}
          defaultValue={message}
          placeholder={t("adminSettings.maintenancePlaceholder")}
          className={input}
        />
        <p className="mt-1 text-xs text-muted">{t("settingDefs.maintenance_message.help")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className={label}>{t("settingDefs.maintenance_startsAt.label")}</span>
          <DateTimePicker name="startsAt" defaultValue={startsAt} defaultTime="22:00" />
          <p className="mt-1 text-xs text-muted">{t("settingDefs.maintenance_startsAt.help")}</p>
        </div>
        <div>
          <span className={label}>{t("settingDefs.maintenance_endsAt.label")}</span>
          <DateTimePicker name="endsAt" defaultValue={endsAt} defaultTime="23:00" />
          <p className="mt-1 text-xs text-muted">{t("settingDefs.maintenance_endsAt.help")}</p>
        </div>
      </div>
      {canAnnounce && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="announce" className="accent-bit" />
          {t("adminSettings.maintenanceAnnounce")}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={btnPrimary}>
          {pending ? t("common.saving") : t("common.save")}
        </button>
        {message && (
          <button name="clear" value="1" disabled={pending} className={btnSecondary}>
            {t("adminSettings.maintenanceRemove")}
          </button>
        )}
      </div>
    </form>
  );
}

/** A post the admin writes for the public announcements channel. */
export function AnnounceForm({ action }: { action: Action }) {
  const t = useT();
  const [state, formAction, pending] = useToastAction(action, undefined);
  return (
    <form key={state?.ok ? state.at : 0} action={formAction} className="space-y-3">
      <div>
        <label className={label} htmlFor="announce-title">
          {t("adminSettings.announceTitle")}
        </label>
        <input id="announce-title" name="title" required maxLength={200} className={input} placeholder={t("adminSettings.announceTitlePlaceholder")} />
      </div>
      <div>
        <label className={label} htmlFor="announce-text">
          {t("adminSettings.announceText")}
        </label>
        <textarea id="announce-text" name="text" rows={4} maxLength={3500} className={input} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className={btnSecondary}>
          {pending ? t("settingsUi.working") : t("adminSettings.announcePost")}
        </button>
      </div>
    </form>
  );
}
