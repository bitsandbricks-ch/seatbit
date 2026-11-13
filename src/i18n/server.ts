import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getSetting } from "@/lib/settings";
import { getCurrentUser } from "@/lib/session";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { makeT } from "./translate";

/** The instance's language for people and places with no preference (Discord posts, mails to guests). */
export function instanceLocale(): Locale {
  const v = getSetting("i18n.defaultLocale");
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Language for someone who isn't in front of a browser right now (mails, Discord DMs). */
export function localeOf(u: { locale?: string | null } | null | undefined): Locale {
  return isLocale(u?.locale) ? u.locale : instanceLocale();
}

/** This request's language: the profile choice, then the cookie, then the browser, then the instance default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const me = await getCurrentUser();
  if (isLocale(me?.locale)) return me.locale;
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return matchAcceptLanguage((await headers()).get("accept-language")) ?? instanceLocale();
});

export async function getT() {
  return makeT(await getLocale());
}

export { makeT };
