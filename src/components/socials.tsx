"use client";
import { useToastAction } from "./action-form";
import { updateSocials, type AppearanceState } from "@/app/actions";
import { SOCIALS, SOCIAL_MAX } from "@/lib/socials";
import { Input, btnPrimary, label } from "./ui";
import { useT } from "@/i18n/client";

/**
 * Profile › Socials: gaming and social handles shown on the member profile, each with
 * a "Show on profile" box. Discord starts with the linked account's username.
 */
export function SocialsForm({
  values,
  hidden,
  discordUsername,
}: {
  values: Record<string, string>;
  hidden: string[];
  discordUsername: string | null;
}) {
  const t = useT();
  const [, action, pending] = useToastAction<AppearanceState>(updateSocials, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        {SOCIALS.map((s) => {
          const fromDiscord = s.key === "discord" && !values.discord && discordUsername;
          return (
            <div key={s.key} className="min-w-0">
              {/* The "show" box sits on the label line, so each field takes one row less. */}
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor={`social-${s.key}`} className={`${label} !mb-0 truncate`}>
                  {s.label}
                </label>
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" name={`show_${s.key}`} defaultChecked={!hidden.includes(s.key)} aria-label={`${s.label}: ${t("profile.socialShow")}`} className="accent-bit" />
                  {t("profile.socialShow")}
                </label>
              </div>
              <Input
                id={`social-${s.key}`}
                name={s.key}
                defaultValue={values[s.key] || (fromDiscord ? discordUsername : "")}
                maxLength={SOCIAL_MAX}
                placeholder={s.placeholder}
                autoComplete="off"
              />
              {fromDiscord && <p className="mt-1.5 text-xs text-muted">{t("profile.socialFromDiscord")}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={pending} className={btnPrimary}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}
