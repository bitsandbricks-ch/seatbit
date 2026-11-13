// The language for someone who isn't in front of a browser right now (mails, Discord).
// No server-only imports and relative paths, so scripts run with tsx can use it too.
import { getSetting } from "../lib/settings";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/** The instance's language for people and places with no preference. */
export function instanceLocale(): Locale {
  const v = getSetting("i18n.defaultLocale");
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** A user's saved language, else the instance default. */
export function localeOf(u: { locale?: string | null } | null | undefined): Locale {
  return isLocale(u?.locale) ? u.locale : instanceLocale();
}

/** A clan's language for Discord posts, else the instance default. */
export const clanLocale = localeOf;
