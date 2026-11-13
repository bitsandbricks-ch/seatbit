"use client";
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { makeT } from "./translate";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Set once in the root layout with the language the server picked for this request. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

export function useT() {
  const locale = useLocale();
  return useMemo(() => makeT(locale), [locale]);
}
