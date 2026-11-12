import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/header";
import { getLegal } from "@/lib/legal";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  colorScheme: "dark",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "Seatbit",
  description: "Coordinate who in your group goes to which LAN party, tickets and seats",
};

/** Footer link to the commit this build came from; nothing when the build had no git info. */
function CommitLink({ sourceUrl }: { sourceUrl: string }) {
  const sha = process.env.SEATBIT_COMMIT;
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;
  const short = sha.slice(0, 7);
  // GitHub, Gitea and Forgejo use /commit/<sha>, GitLab /-/commit/<sha>.
  const base = sourceUrl.replace(/\/+$/, "");
  const href = /^https:\/\/gitlab\./.test(base) ? `${base}/-/commit/${sha}` : `${base}/commit/${sha}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono hover:text-fg" title={`Commit ${sha}`}>
      {short}
    </a>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 pb-8 pt-5 sm:pt-8">{children}</main>
        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-line/50 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 text-xs text-muted sm:pb-6">
          <span>Seatbit</span>
          <CommitLink sourceUrl={getLegal().sourceUrl} />
          <Link href="/terms" className="hover:text-fg">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            Privacy
          </Link>
          <a href={getLegal().sourceUrl} target="_blank" rel="noreferrer" className="hover:text-fg">
            Source
          </a>
          <a href="https://buymeacoffee.com/bitsandbricks" target="_blank" rel="noreferrer" className="hover:text-fg">
            Buy me a coffee
          </a>
          {/* Please keep this attribution when you host your own instance. */}
          <a href="https://bitsandbricks.ch" target="_blank" rel="noreferrer" className="hover:text-fg">
            Powered by bitsandbricks.ch
          </a>
        </footer>
      </body>
    </html>
  );
}
