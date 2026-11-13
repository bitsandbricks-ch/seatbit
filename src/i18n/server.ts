import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { instanceLocale } from "./user-locale";
import { getCurrentUser } from "@/lib/session";
import { LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { makeT } from "./translate";

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
export { instanceLocale, localeOf, clanLocale } from "./user-locale";
