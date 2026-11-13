import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/header";
import { donationsEnabled } from "@/lib/donations";
import { getLegal } from "@/lib/legal";
import { LanguageLinks } from "@/components/language-switch";
import { I18nProvider } from "@/i18n/client";
import { getT } from "@/i18n/server";
import { THEME_COLORS } from "@/lib/theme";
import { getTheme } from "@/lib/theme-server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Browser toolbar colour follows the theme: fixed when picked, by the device setting for "System". */
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();
  return {
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[theme],
    colorScheme: theme === "system" ? "dark light" : theme,
    viewportFit: "cover",
  };
}

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "Seatbit",
  description: "Coordinate who in your group goes to which LAN party, tickets and seats",
};

/** Short hash of the commit this build came from, linked to it; nothing when the build had no git info. */
function CommitLink({ sourceUrl, className, title }: { sourceUrl: string; className: string; title: string }) {
  const sha = process.env.SEATBIT_COMMIT;
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  // GitHub, Gitea and Forgejo use /commit/<sha>, GitLab /-/commit/<sha>.
  const base = sourceUrl.replace(/\/+$/, "");
  const href = /^https:\/\/gitlab\./.test(base) ? `${base}/-/commit/${sha}` : `${base}/commit/${sha}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title.replace("{sha}", sha)} className={`font-mono hover:text-fg ${className}`}>
      {sha.slice(0, 7)}
    </a>
  );
}

const badge = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition";

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const t = await getT();
  // Set on the server, so the page never flashes the wrong theme. "System" is pure CSS (prefers-color-scheme).
  const theme = await getTheme();
  const commitTitle = t("footer.commit", { sha: "{sha}" });
  return (
    <html lang={t.locale} data-theme={theme === "system" ? undefined : theme} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={t.locale}>
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pb-8 pt-5 sm:pt-8">{children}</main>
        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-line/50 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 text-xs text-muted sm:pb-6">
          <span>Seatbit</span>
          <Link href="/terms" className="hover:text-fg">
            {t("footer.terms")}
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            {t("footer.privacy")}
          </Link>
          <a href={getLegal().sourceUrl} target="_blank" rel="noreferrer" className="hover:text-fg">
            {t("footer.source")}
          </a>
          {donationsEnabled() && (
            <Link href="/donate" className="hover:text-fg">
              {t("footer.donate")}
            </Link>
          )}
          <LanguageLinks />
          {/* Phones: the screen corner is taken by the tab bar, so the hash stays in the footer. */}
          <CommitLink sourceUrl={getLegal().sourceUrl} className="sm:hidden" title={commitTitle} />
          <div className="flex w-full flex-wrap justify-center gap-2 pt-2">
            <a
              href="https://buymeacoffee.com/bitsandbricks"
              target="_blank"
              rel="noreferrer"
              className={`${badge} border-warn/40 bg-warn/10 text-warn hover:bg-warn/20`}
            >
              <span aria-hidden>☕</span> {t("footer.coffee")}
            </a>
            {/* Please keep this attribution when you host your own instance. */}
            <a
              href="https://bitsandbricks.ch"
              target="_blank"
              rel="noreferrer"
              className={`${badge} border-bit/40 bg-bit-soft text-bit hover:bg-bit/20`}
            >
              {t.rich("footer.poweredBy", { site: <span className="font-semibold">bitsandbricks.ch</span> })}
            </a>
          </div>
        </footer>
        {/* Desktop: pinned to the screen's bottom-left corner. */}
        <CommitLink
          sourceUrl={getLegal().sourceUrl}
          className="fixed bottom-2 left-3 z-20 hidden text-[11px] text-faint sm:block"
          title={commitTitle}
        />
        </I18nProvider>
      </body>
    </html>
  );
}
