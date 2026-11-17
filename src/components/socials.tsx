"use client";
import { useToastAction } from "./action-form";
import { updateSocials, type AppearanceState } from "@/app/actions";
import { SOCIALS, SOCIAL_MAX } from "@/lib/socials";
import { Field, Input, btnPrimary } from "./ui";
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
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIALS.map((s) => {
          const fromDiscord = s.key === "discord" && !values.discord && discordUsername;
          return (
            <div key={s.key}>
              <Field label={s.label} hint={fromDiscord ? t("profile.socialFromDiscord") : undefined}>
                <Input
                  name={s.key}
                  defaultValue={values[s.key] || (fromDiscord ? discordUsername : "")}
                  maxLength={SOCIAL_MAX}
                  placeholder={s.placeholder}
                  autoComplete="off"
                />
              </Field>
              <label className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" name={`show_${s.key}`} defaultChecked={!hidden.includes(s.key)} className="accent-bit" />
                {t("profile.socialShow")}
              </label>
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
