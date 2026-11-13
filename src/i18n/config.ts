// Shared by server and client code: no server-only imports here.

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Shown in the language picker, each in its own language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

/** Remembers the language for people who aren't signed in (and right after a change). */
export const LOCALE_COOKIE = "seatbit-locale";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** Best supported language from an Accept-Language header ("de-CH,de;q=0.9,en;q=0.8"), or null. */
export function matchAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const wanted = header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((w) => w.lang && w.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  return wanted.map((w) => w.lang).find(isLocale) ?? null;
}
