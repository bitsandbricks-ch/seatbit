import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Header } from "@/components/header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "Seatbit",
  description: "Coordinate who in your group goes to which LAN party, tickets and seats",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
        <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-4 pb-24 pt-6 text-xs text-faint sm:pb-6">
          <span>Seatbit</span>
          <Link href="/terms" className="hover:text-muted">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-muted">
            Privacy
          </Link>
          <a href="https://bitsandbricks.ch" target="_blank" rel="noreferrer" className="hover:text-muted">
            Powered by bitsandbricks.ch
          </a>
        </footer>
      </body>
    </html>
  );
}
