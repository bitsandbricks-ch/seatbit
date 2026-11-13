"use client";
import { useActionState, useState } from "react";
import { reportContent, type ReportState } from "@/app/moderation-actions";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { btnGhost, btnPrimary, input } from "./ui";
import { useT } from "@/i18n/client";

/**
 * A quiet "Report this clan / event" link at the bottom of a page. Opens a short form that goes
 * to the platform moderators, never to the clan's own admins.
 */
export function ReportButton({ clanId, lanId }: { clanId?: string; lanId?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReportState, FormData>(reportContent, undefined);
  const what = lanId ? "event" : "clan";

  if (state?.ok)
    return (
      <p role="status" className="text-center text-xs text-muted">
        {t("report.thanks")}
      </p>
    );
  if (!open)
    return (
      <div className="text-center">
        <button type="button" className="text-xs text-faint hover:text-danger hover:underline" onClick={() => setOpen(true)}>
          {t(`report.open.${what}`)}
        </button>
      </div>
    );
  return (
    <form action={action} className="space-y-3 rounded-card border border-line bg-surface p-4 text-sm">
      <p className="font-semibold text-fg">{t(`report.title.${what}`)}</p>
      <p className="text-muted">{t("report.intro")}</p>
      {lanId && <input type="hidden" name="lanId" value={lanId} />}
      {clanId && <input type="hidden" name="clanId" value={clanId} />}
      <fieldset className="space-y-1.5">
        <legend className="sr-only">{t("report.reason")}</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input type="radio" name="reason" value={r} required className="accent-bit" />
            {t(`report.reasons.${r}`)}
          </label>
        ))}
      </fieldset>
      <label className="block">
        <span className="mb-1 block text-xs text-muted">{t("report.message")}</span>
        <textarea name="message" rows={3} maxLength={2000} className={input} />
      </label>
      {state?.error && <p className="text-danger">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={pending}>
          {t("report.send")}
        </button>
        <button type="button" className={btnGhost} onClick={() => setOpen(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
