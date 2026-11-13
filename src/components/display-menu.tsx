"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/locale-actions";
import { LOCALES, LOCALE_NAMES } from "@/i18n/config";
import { useLocale, useT } from "@/i18n/client";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const icons: Record<Theme, string> = {
  light: "M12 3v2M12 19v2M5.6 5.6 7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  dark: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  system: "M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM9 20h6M12 16v4",
};

function Icon({ theme, className = "h-4 w-4" }: { theme: Theme; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={icons[theme]} />
    </svg>
  );
}

/** Remember the choice for the server and switch right away. */
function applyTheme(next: Theme) {
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  const html = document.documentElement;
  if (next === "system") html.removeAttribute("data-theme");
  else html.setAttribute("data-theme", next);
}

const option = (on: boolean) =>
  `flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium transition ${
    on ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:text-fg"
  }`;

/**
 * Header: one compact button for language and theme, on phones and desktops,
 * signed in or not. Language goes through setLocale like the footer and the
 * profile (saved on the profile when signed in). The theme is a cookie, so the
 * server renders the right one on the next load without a flash.
 */
export function DisplayMenu({ theme: initial }: { theme: Theme }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(initial);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function pickTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    // The refresh brings the server's html attribute and toolbar colour in line.
    router.refresh();
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label={t("display.menu")}
        title={t("display.menu")}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold uppercase tracking-wide transition ${
          open ? "border-bit/60 bg-raised text-fg" : "border-line bg-surface text-muted hover:border-bit/60 hover:text-fg"
        }`}
      >
        <Icon theme={theme} />
        <span>{locale}</span>
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-40 mt-2 w-[min(17rem,calc(100vw-2rem))] space-y-3 rounded-card border border-line bg-surface p-3 shadow-xl shadow-black/20"
        >
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{t("language.label")}</legend>
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-raised p-1">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  disabled={pending}
                  aria-pressed={l === locale}
                  onClick={() => start(() => setLocale(l))}
                  className={option(l === locale)}
                >
                  {LOCALE_NAMES[l]}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{t("display.theme")}</legend>
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-line bg-raised p-1">
              {(["light", "dark", "system"] as const).map((th) => (
                <button key={th} type="button" aria-pressed={th === theme} onClick={() => pickTheme(th)} className={`${option(th === theme)} flex-col !gap-0.5 py-1.5 text-xs`}>
                  <Icon theme={th} />
                  {t(`display.${th}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-faint">{t("display.themeHint")}</p>
          </fieldset>
        </div>
      )}
    </div>
  );
}
