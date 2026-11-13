import type { SettingView } from "./settings";
import type { MessageKey, T } from "@/i18n/translate";

/** A setting's label, help and choices in the admin's language (settings.ts keeps the English source). */
export function localized(s: SettingView, t: T): SettingView {
  const slug = s.key.replace(".", "_");
  const tf = (k: string, fb: string | undefined) => {
    const v = t(k as MessageKey);
    return v === k ? fb : v;
  };
  return {
    ...s,
    label: tf(`settingDefs.${slug}.label`, s.label) ?? s.label,
    help: tf(`settingDefs.${slug}.help`, s.help),
    options: s.options?.map((o) => ({ ...o, label: tf(`settingDefs.${slug}.options.${o.value}`, o.label) ?? o.label })),
  };
}
