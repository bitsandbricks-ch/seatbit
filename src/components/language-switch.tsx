"use client";
import { useTransition } from "react";
import { setLocale } from "@/app/locale-actions";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { input } from "./ui";

/** Footer: the languages side by side, the current one highlighted. */
export function LanguageLinks() {
  const current = useLocale();
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <span role="group" aria-label={t("language.switchTo")} className="inline-flex gap-2">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          disabled={pending}
          aria-pressed={l === current}
          onClick={() => start(() => setLocale(l))}
          className={l === current ? "font-medium text-fg" : "hover:text-fg"}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </span>
  );
}

/** Profile: language with an "automatic" option that follows the browser. */
export function LanguageSelect({ saved }: { saved: string | null }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1.5">
      <select
        // Remount when the header or footer switch changes the saved language.
        key={saved ?? "auto"}
        className={input}
        defaultValue={saved ?? "auto"}
        disabled={pending}
        aria-label={t("language.label")}
        onChange={(e) => {
          const v = e.target.value;
          start(() => setLocale(v));
        }}
      >
        <option value="auto">{t("language.auto")}</option>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted">{pending ? t("common.saving") : t("language.hint")}</p>
    </div>
  );
}
