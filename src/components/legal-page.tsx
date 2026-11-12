import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED, getLegal } from "@/lib/legal";
import { Notice, Page, PageHeader } from "./ui";

/** Long-form text page for the Terms of Service and the Privacy Policy. Title like every page, text at a readable width. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Page>
      <PageHeader title={title} subtitle={`Last updated: ${LEGAL_LAST_UPDATED}`} />
      {!getLegal().complete && (
        <Notice tone="warn">
          The operator of this Seatbit instance hasn&apos;t filled in their name and contact details yet. Admins can add
          them under Admin → Platform settings → Operator &amp; legal.
        </Notice>
      )}
    <article
      className="max-w-3xl space-y-4 text-sm leading-relaxed text-fg/90
        [&_a]:text-bit [&_a:hover]:underline
        [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fg
        [&_h3]:pt-2 [&_h3]:font-semibold [&_h3]:text-fg
        [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5
        [&_strong]:text-fg"
    >
      {children}
    </article>
    </Page>
  );
}

/** The operator's name, address and email, as far as they are set. */
export function Operator() {
  const legal = getLegal();
  if (!legal.operatorName && !legal.contactEmail && !legal.operatorAddress) {
    return <p className="text-muted">The operator of this Seatbit instance (details not provided yet).</p>;
  }
  return (
    <p>
      {legal.operatorName ?? "The operator of this Seatbit instance"}
      {legal.operatorAddress && (
        <>
          <br />
          {legal.operatorAddress}
        </>
      )}
      {legal.contactEmail && (
        <>
          <br />
          <ContactEmail />
        </>
      )}
    </p>
  );
}

/** The contact email as a link, or a hint where to reach the operator when none is set. */
export function ContactEmail() {
  const { contactEmail } = getLegal();
  return contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <span>the operator of this instance (no contact email set yet)</span>
  );
}
