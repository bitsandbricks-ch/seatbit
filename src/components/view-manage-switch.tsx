"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

/**
 * The View / Manage switch next to a page title (events, clans). Shown only to people who can manage the
 * thing, so editing is always one tap away and it's obvious which mode you're in.
 */
export function ViewManageSwitch({
  mode,
  viewHref,
  manageHref,
  manageBadge,
}: {
  mode: "view" | "manage";
  viewHref: string;
  manageHref: string;
  /** Something waiting in manage mode, e.g. join requests. Shown as a dot with a number. */
  manageBadge?: number;
}) {
  const t = useT();
  return (
    <nav aria-label={t("common.viewOrManage")} className="inline-flex rounded-lg border border-line bg-raised p-1">
      <Link
        href={viewHref}
        aria-current={mode === "view" ? "page" : undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-sm font-medium transition ${
          mode === "view" ? "bg-surface text-fg shadow" : "text-muted hover:text-fg"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        {t("common.view")}
      </Link>
      <Link
        href={manageHref}
        aria-current={mode === "manage" ? "page" : undefined}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3.5 text-sm font-semibold transition ${
          mode === "manage" ? "bg-bit text-on-bit shadow" : "text-bit hover:bg-bit-soft"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
        {t("common.manage")}
        {!!manageBadge && (
          <span
            className="rounded-full bg-warn px-1.5 py-px text-[11px] font-semibold tabular-nums text-ink"
            title={t("common.waiting", { count: manageBadge })}
          >
            {manageBadge}
          </span>
        )}
      </Link>
    </nav>
  );
}
