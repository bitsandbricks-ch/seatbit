import Link from "next/link";
import type { T } from "@/i18n/translate";
import type { WishItem } from "@/lib/seating";
import { Card, Pill, Segmented } from "./ui";

export type WishRow = {
  userId: string;
  name: string;
  /** Full name, small below the display name. */
  full?: string;
  seat: string | null;
  items: WishItem[];
  score: number | null;
  note: string;
};

/** "look": only members whose wishes aren't all met (or can't be checked); "all": everyone with wishes. */
export type WishFilter = "look" | "all";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tone = (x: number) => (x >= 0.8 ? "emerald" : x >= 0.5 ? "amber" : "red");
const text = (x: number) => (x >= 0.8 ? "text-bit" : x >= 0.5 ? "text-warn" : "text-danger");
const bar = (x: number) => (x >= 0.8 ? "bg-bit" : x >= 0.5 ? "bg-warn" : "bg-danger");
const needsLook = (r: WishRow) => r.score !== 1;

/** One wish: rank, ✓/✗/·, text. */
function Wish({ i, t, inline }: { i: WishItem; t: T; inline?: boolean }) {
  const Tag = inline ? "span" : "li";
  return (
    <Tag className={i.ok === false ? "text-fg" : "text-muted"}>
      <span className="mr-0.5 tabular-nums text-faint">{i.rank ?? "–"}</span>
      <span aria-hidden className={`mr-1 font-semibold ${i.ok === null ? "text-faint" : i.ok ? "text-bit" : "text-danger"}`}>
        {i.ok === null ? "·" : i.ok ? "✓" : "✗"}
      </span>
      <span className="sr-only">{i.ok === null ? t("wishOverview.srOpen") : i.ok ? t("wishOverview.srMet") : t("wishOverview.srMissed")}</span>
      {i.text}
    </Tag>
  );
}

/**
 * The leads' view of everyone's seat wishes against the current plan: one weighted score
 * overall and per member (a top wish counts more), lowest first. By default it lists only
 * the members who need a look. Each member is one line with their missed wishes; tapping
 * it opens the full ranked list and the note. The filter is a link, so it works without JS.
 */
export function WishOverview({
  rows,
  overall,
  filter,
  href,
  editHref,
  t,
}: {
  rows: WishRow[];
  overall: number | null;
  filter: WishFilter;
  /** URL for a filter. */
  href: (f: WishFilter) => string;
  /** Link to change a member's wishes; none once the plan is final. */
  editHref?: (userId: string) => string;
  t: T;
}) {
  const scored = rows.filter((r) => r.score !== null);
  const happy = scored.filter((r) => r.score === 1).length;
  const look = rows.filter(needsLook);
  const shown = (filter === "look" ? look : rows).sort((a, b) => (a.score ?? 2) - (b.score ?? 2) || a.name.localeCompare(b.name));

  return (
    <Card
      id="wishes"
      className="lg:col-span-2"
      title={t("wishOverview.title")}
      actions={overall !== null && <Pill tone={tone(overall)}>{t("wishOverview.met", { pct: pct(overall) })}</Pill>}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("wishOverview.none")}</p>
      ) : (
        <>
          <div className="mb-3 space-y-2">
            {overall !== null && (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-line"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(overall * 100)}
                aria-label={t("wishOverview.overall")}
              >
                <div className={`h-full rounded-full ${bar(overall)}`} style={{ width: pct(overall) }} />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                label={t("wishOverview.filter")}
                value={filter}
                options={[
                  { id: "look", label: t("wishOverview.needsLook"), count: look.length, href: href("look") },
                  { id: "all", label: t("wishOverview.everyone"), count: rows.length, href: href("all") },
                ]}
              />
              {scored.length > 0 && <p className="text-xs text-muted">{t("wishOverview.allMet", { count: happy, total: scored.length })}</p>}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">{t("wishOverview.allGood")}</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {shown.map((r) => {
                const missed = r.items.filter((i) => i.ok === false);
                const met = r.items.filter((i) => i.ok === true).length;
                const checkable = r.items.filter((i) => i.ok !== null).length;
                return (
                  <li key={r.userId}>
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="font-medium leading-tight [overflow-wrap:anywhere]">{r.name}</span>
                          <span className="ml-1.5 font-mono text-xs text-faint">{r.seat ?? t("wishOverview.noSeat")}</span>
                          {r.full && r.full !== r.name && <span className="block text-xs text-faint [overflow-wrap:anywhere]">{r.full}</span>}
                        </span>
                        <span className="flex items-baseline gap-2 text-right text-xs tabular-nums">
                          {checkable > 0 && <span className="text-faint">{t("wishOverview.metOf", { met, total: r.items.length })}</span>}
                          {r.score !== null ? <span className={`font-semibold ${text(r.score)}`}>{pct(r.score)}</span> : <span className="text-faint">–</span>}
                          <span aria-hidden className="text-faint transition group-open:rotate-90">›</span>
                        </span>
                        {(missed.length > 0 || (r.note && r.items.length === 0)) && (
                          <span className="col-span-2 text-xs group-open:hidden">
                            {missed.length > 0 ? (
                              <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {missed.map((i) => (
                                  <Wish key={i.text} i={i} t={t} inline />
                                ))}
                              </span>
                            ) : (
                              <span className="italic text-muted [overflow-wrap:anywhere]">“{r.note}”</span>
                            )}
                          </span>
                        )}
                      </summary>
                      <div className="space-y-1 pb-3 text-xs">
                        {r.items.length > 0 && (
                          <ol className="space-y-0.5" aria-label={t("wishOverview.ranked", { name: r.name })}>
                            {r.items.map((i) => (
                              <Wish key={i.text} i={i} t={t} />
                            ))}
                          </ol>
                        )}
                        {r.note && <p className="italic text-muted [overflow-wrap:anywhere]">“{r.note}”</p>}
                        {editHref && (
                          <Link href={editHref(r.userId)} className="inline-block pt-1 text-bit hover:underline">
                            {t("wishLead.edit")}
                          </Link>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-faint">{t("wishOverview.hint")}</p>
        </>
      )}
    </Card>
  );
}
