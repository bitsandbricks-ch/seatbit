import Link from "next/link";
import type { ReactNode } from "react";
import { legal } from "@/lib/legal";

/** Long-form text page for the Terms of Service and the Privacy Policy. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article
      className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed text-fg/90
        [&_a]:text-bit [&_a:hover]:underline
        [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg
        [&_h3]:pt-2 [&_h3]:font-semibold [&_h3]:text-fg
        [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5
        [&_strong]:text-fg"
    >
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-fg">{title}</h1>
        <p className="text-xs text-muted">Last updated: {legal.lastUpdated}</p>
      </header>
      {children}
    </article>
  );
}

/** "By continuing you agree to ..." line under the sign-in and sign-up forms. */
export function LegalNotice() {
  return (
    <p className="mx-auto mt-4 w-full max-w-sm text-center text-xs text-muted">
      By continuing you agree to the{" "}
      <Link href="/terms" className="text-muted underline hover:text-fg">
        Terms of Service
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" className="text-muted underline hover:text-fg">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

export function Operator() {
  return (
    <p>
      {legal.operatorName}
      <br />
      {legal.operatorAddress}
      <br />
      <a href={`mailto:${legal.contactEmail}`}>{legal.contactEmail}</a>
    </p>
  );
}
