"use client";
import { useToastAction } from "./action-form";
import { updateNotifications, type AppearanceState } from "@/app/actions";
import { useT } from "@/i18n/client";
import { btnPrimary } from "./ui";

/** Profile › Notifications: email reminders and Discord DMs. */
export function NotificationsForm({
  email,
  emailReminders,
  discordDms,
  hasDiscord,
}: {
  email: string;
  emailReminders: boolean;
  discordDms: boolean;
  hasDiscord: boolean;
}) {
  const t = useT();
  const [, action, pending] = useToastAction<AppearanceState>(updateNotifications, {});
  const row = "flex cursor-pointer items-start gap-3 rounded-md border border-line bg-raised/40 p-3 text-sm";
  return (
    <form action={action} className="space-y-3">
      <label className={row}>
        <input type="checkbox" name="emailReminders" defaultChecked={emailReminders} className="mt-0.5" />
        <span>
          {t("profile.emailReminders")}
          <span className="block text-xs text-muted">{t("profile.emailRemindersHint", { email })}</span>
        </span>
      </label>
      <label className={row}>
        <input type="checkbox" name="discordDms" defaultChecked={discordDms} className="mt-0.5" />
        <span>
          {t("profile.discordDms")}
          <span className="block text-xs text-muted">
            {t("profile.discordDmsHint")}
            {!hasDiscord && ` ${t("profile.discordDmsLink")}`}
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3 pt-1">
        <button disabled={pending} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
