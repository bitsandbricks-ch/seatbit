import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { instanceLocale } from "./user-locale";
import { getCurrentUser } from "@/lib/session";
import { LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { makeT, type MessageKey, type Vars } from "./translate";

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

/** A message in this request's language, for a server action's `{ error }` result. */
export async function tr(key: MessageKey, vars?: Vars) {
  return (await getT())(key, vars);
}

/** An Error in this request's language, for `throw await err(...)` in a server action. */
export async function err(key: MessageKey, vars?: Vars) {
  return new Error(await tr(key, vars));
}
