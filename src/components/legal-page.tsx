import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED, getLegal } from "@/lib/legal";
import { Notice, Page, PageHeader } from "./ui";
import { getT } from "@/i18n/server";
import { fmtDay } from "@/lib/format";

/** Long-form text page for the Terms of Service and the Privacy Policy. Title like every page, text at a readable width. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getT();
  return (
    <Page>
      <PageHeader title={title} subtitle={t("legal.updated", { date: fmtDay(LEGAL_LAST_UPDATED) })} />
      {!getLegal().complete && (
        <Notice tone="warn">{t("legal.incomplete")}</Notice>
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
export async function Operator() {
  const t = await getT();
  const legal = getLegal();
  if (!legal.operatorName && !legal.contactEmail && !legal.operatorAddress) {
    return <p className="text-muted">{t("legal.operatorUnknown")}</p>;
  }
  return (
    <p>
      {legal.operatorName ?? t("legal.operator")}
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
export async function ContactEmail() {
  const t = await getT();
  const { contactEmail } = getLegal();
  return contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <span>{t("legal.noEmail")}</span>
  );
}
