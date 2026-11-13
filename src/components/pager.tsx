"use client";
import { useState } from "react";
import { btnGhost, btnSecondary } from "./ui";
import { nameMatches } from "@/lib/names";
import { useT } from "@/i18n/client";

/**
 * Client-side paging for long lists (clan members, attendees). Keeps the page
 * in range when filters shrink the list. `size` 0 = show everything.
 */
export function usePager<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const size = all ? 0 : pageSize;
  const pages = size ? Math.max(1, Math.ceil(items.length / size)) : 1;
  const current = Math.min(page, pages - 1);
  const slice = size ? items.slice(current * size, current * size + size) : items;
  return {
    items: slice,
    page: current,
    pages,
    total: items.length,
    from: items.length ? (size ? current * size : 0) + 1 : 0,
    to: size ? Math.min(items.length, current * size + size) : items.length,
    showAll: all,
    pageSize,
    setPage,
    setShowAll: (v: boolean) => {
      setAll(v);
      setPage(0);
    },
    /** Call when the search or a filter changes. */
    reset: () => setPage(0),
  };
}

export type Pager = ReturnType<typeof usePager>;

/** "1–20 of 34" with page buttons and "Show all". Hidden when everything fits on one page. */
/** `members` counts members instead of people in "All 34 …". */
export function PagerBar({ pager, members }: { pager: Pager; members?: boolean }) {
  const t = useT();
  const { page, pages, total, from, to, showAll, pageSize } = pager;
  if (total <= pageSize) return null;
  // Page numbers: first, last and the ones around the current page; "…" for gaps.
  const nums: (number | "gap")[] = [];
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "gap") nums.push("gap");
  }
  return (
    <nav aria-label={t("pager.pages")} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted">
        {showAll ? (
          t(members ? "pager.allMembers" : "pager.allPeople", { count: total })
        ) : (
          <>
            {from}–{to} <span className="text-faint">{t("pager.of", { total })}</span>
          </>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-1">
        {!showAll && (
          <>
            <button
              type="button"
              className={`${btnGhost} !px-2`}
              disabled={page === 0}
              onClick={() => pager.setPage(page - 1)}
              aria-label={t("pager.prev")}
            >
              ‹
            </button>
            {nums.map((n, i) =>
              n === "gap" ? (
                <span key={`g${i}`} className="px-1 text-faint">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => pager.setPage(n)}
                  aria-current={n === page ? "page" : undefined}
                  className={`${n === page ? `${btnSecondary} !border-bit` : btnGhost} min-w-10 !px-2 tabular-nums sm:min-w-9`}
                >
                  {n + 1}
                </button>
              ),
            )}
            <button
              type="button"
              className={`${btnGhost} !px-2`}
              disabled={page >= pages - 1}
              onClick={() => pager.setPage(page + 1)}
              aria-label={t("pager.next")}
            >
              ›
            </button>
          </>
        )}
        <button type="button" className={`${btnGhost} text-xs`} onClick={() => pager.setShowAll(!showAll)}>
          {t(showAll ? "pager.showPages" : "pager.showAll")}
        </button>
      </span>
    </nav>
  );
}

/** "Every word appears somewhere", ignoring case and accents: "mike kel" finds Mike Keller, "muller" finds Müller. */
export const matches = nameMatches;
